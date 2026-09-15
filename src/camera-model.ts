export const presets = {
  front: { pitch: 70, yaw: 0, roll: 0, fov: 100 },
  cabin: { pitch: -95, yaw: 0, roll: 180, fov: 110 },
};
/** Column-major camera basis consumed directly by the GPU. */
export function cameraBasis(
  pitch: number,
  yaw: number,
  roll: number,
): Float32Array {
  const p = (pitch * Math.PI) / 180,
    y = (yaw * Math.PI) / 180,
    r = (roll * Math.PI) / 180;
  const cp = Math.cos(p),
    sp = Math.sin(p),
    cy = Math.cos(y),
    sy = Math.sin(y),
    cr = Math.cos(r),
    sr = Math.sin(r);
  const transform = (x: number, v: number, z: number) => {
    const ry = cp * v + sp * z,
      rz = -sp * v + cp * z;
    return [cy * x + sy * rz, ry, -sy * x + cy * rz];
  };
  return new Float32Array([
    ...transform(cr, sr, 0),
    ...transform(-sr, cr, 0),
    ...transform(0, 0, 1),
  ]);
}
