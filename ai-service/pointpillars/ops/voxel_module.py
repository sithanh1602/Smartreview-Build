import numpy as np
import numba
import torch
import torch.nn as nn

@numba.njit(fastmath=True)
def hard_voxelize_numba(points, voxels, coors, num_points_per_voxel, coor_to_voxelidx,
                        voxel_size, coors_range, grid_size, max_points, max_voxels):
    num_points = points.shape[0]
    num_features = points.shape[1]
    voxel_num = 0

    for i in range(num_points):
        # Compute grid coords: z, y, x (reverse of x, y, z)
        cz = int(np.floor((points[i, 2] - coors_range[2]) / voxel_size[2]))
        if cz < 0 or cz >= grid_size[2]: continue
        cy = int(np.floor((points[i, 1] - coors_range[1]) / voxel_size[1]))
        if cy < 0 or cy >= grid_size[1]: continue
        cx = int(np.floor((points[i, 0] - coors_range[0]) / voxel_size[0]))
        if cx < 0 or cx >= grid_size[0]: continue

        voxelidx = coor_to_voxelidx[cz, cy, cx]
        if voxelidx == -1:
            if max_voxels != -1 and voxel_num >= max_voxels:
                continue
            voxelidx = voxel_num
            voxel_num += 1
            coor_to_voxelidx[cz, cy, cx] = voxelidx
            coors[voxelidx, 0] = cz
            coors[voxelidx, 1] = cy
            coors[voxelidx, 2] = cx

        num = num_points_per_voxel[voxelidx]
        if max_points == -1 or num < max_points:
            for k in range(num_features):
                voxels[voxelidx, num, k] = points[i, k]
            num_points_per_voxel[voxelidx] += 1

    return voxel_num


def hard_voxelize(points, voxels, coors, num_points_per_voxel, voxel_size,
                  coors_range, max_points, max_voxels, NDim=3, deterministic=True):
    device = points.device
    pts_np = points.detach().cpu().numpy()
    
    vs = np.array(voxel_size, dtype=np.float32)
    cr = np.array(coors_range, dtype=np.float32)
    grid_size = np.round((cr[3:] - cr[:3]) / vs).astype(np.int64)

    voxels_np = np.zeros((max_voxels, max_points, pts_np.shape[1]), dtype=np.float32)
    coors_np = np.zeros((max_voxels, 3), dtype=np.int32)
    num_points_np = np.zeros((max_voxels,), dtype=np.int32)
    coor_to_voxelidx = np.full((grid_size[2], grid_size[1], grid_size[0]), -1, dtype=np.int32)

    v_num = hard_voxelize_numba(
        pts_np, voxels_np, coors_np, num_points_np, coor_to_voxelidx,
        vs, cr, grid_size, max_points, max_voxels
    )

    voxels.copy_(torch.from_numpy(voxels_np).to(device))
    coors.copy_(torch.from_numpy(coors_np).to(device))
    num_points_per_voxel.copy_(torch.from_numpy(num_points_np).to(device))
    return v_num


class _Voxelization(torch.autograd.Function):
    @staticmethod
    def forward(ctx,
                points,
                voxel_size,
                coors_range,
                max_points=35,
                max_voxels=20000,
                deterministic=True):
        voxels = points.new_zeros(size=(max_voxels, max_points, points.size(1)))
        coors = points.new_zeros(size=(max_voxels, 3), dtype=torch.int)
        num_points_per_voxel = points.new_zeros(size=(max_voxels, ), dtype=torch.int)
        voxel_num = hard_voxelize(points, voxels, coors,
                                  num_points_per_voxel, voxel_size,
                                  coors_range, max_points, max_voxels, 3,
                                  deterministic)
        voxels_out = voxels[:voxel_num]
        coors_out = coors[:voxel_num].flip(-1) # (z, y, x) -> (x, y, z)
        num_points_per_voxel_out = num_points_per_voxel[:voxel_num]
        return voxels_out, coors_out, num_points_per_voxel_out


class Voxelization(nn.Module):
    def __init__(self,
                 voxel_size,
                 point_cloud_range,
                 max_num_points,
                 max_voxels,
                 deterministic=True):
        super(Voxelization, self).__init__()
        self.voxel_size = voxel_size
        self.point_cloud_range = point_cloud_range
        self.max_num_points = max_num_points
        self.max_voxels = max_voxels
        self.deterministic = deterministic

        point_cloud_range = torch.tensor(point_cloud_range, dtype=torch.float32)
        voxel_size = torch.tensor(voxel_size, dtype=torch.float32)
        grid_size = (point_cloud_range[3:] - point_cloud_range[:3]) / voxel_size
        grid_size = torch.round(grid_size).long()
        input_feat_shape = grid_size[:2]
        self.grid_size = grid_size
        self.pcd_shape = [*input_feat_shape, 1][::-1]

    def forward(self, input):
        if self.training:
            max_voxels = self.max_voxels[0]
        else:
            max_voxels = self.max_voxels[1]

        return _Voxelization.apply(input, self.voxel_size, self.point_cloud_range,
                                   self.max_num_points, max_voxels,
                                   self.deterministic)
