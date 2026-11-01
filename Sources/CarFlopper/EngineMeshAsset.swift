import Foundation
import SceneKit
import UIKit

// MARK: - Embedded V8 engine: CC0 (grab3d.com "Cozy Car Parts & Garage Kit"
// v8-engine, public domain - see ASSETS.md). Real modeled block, heads, valve
// covers, air cleaner, plug wires, exhaust manifolds, belt drive and oil pan
// replace the authored box engine. Detail lives in the 1024px base-color
// texture; the mesh is packed offline to quantized uint16 positions + uint16
// UVs + uint16 indices, with smooth normals rebuilt at load (same scheme as
// CarMeshAsset). Crankshaft runs along z, belt drive at +z (car front),
// oil pan bottom at local y = 0.

enum EngineMeshAsset {

    static let nv = 22064
    static let nf = 19988
    static let minV = SIMD3<Float>(-0.40368, 0.0, -0.34100)
    static let spanV = SIMD3<Float>(0.80700, 0.76300, 0.69400)

    private static let blob: Data = Data(base64Encoded:
        EngineMeshBlobA.b64 + EngineMeshBlobB.b64 + EngineMeshBlobC.b64)!

    private static let baseColor: UIImage =
        UIImage(data: Data(base64Encoded: EngineTexBlob.b64)!)!

    // Fresh material per engine node: the repair flow swaps materials on the
    // part node, so the clean look must be restorable after a rust state.
    static func material() -> SCNMaterial {
        // Default (blinn) lighting like every other scene material: the
        // scene's lightingEnvironment IBL only affects physicallyBased
        // materials, so PBR here got lights + full IBL and blew out white
        // under the HDR bloom camera.
        let m = SCNMaterial()
        m.diffuse.contents = baseColor
        m.roughness.contents = NSNumber(value: 0.55)
        m.metalness.contents = NSNumber(value: 0.25)
        m.specular.contents = UIColor(white: 0.35, alpha: 1)
        return m
    }

    static func geometry() -> SCNGeometry {
        var verts = [Float](repeating: 0, count: nv * 3)
        var norms = [Float](repeating: 0, count: nv * 3)
        var uvs = [Float](repeating: 0, count: nv * 2)
        var idx = [UInt16](repeating: 0, count: nf * 3)
        blob.withUnsafeBytes { ptr in
            let base = ptr.baseAddress!
            let q = base.assumingMemoryBound(to: UInt16.self)
            for i in 0..<nv {
                verts[i*3+0] = minV.x + Float(q[i*3+0]) / 65535.0 * spanV.x
                verts[i*3+1] = minV.y + Float(q[i*3+1]) / 65535.0 * spanV.y
                verts[i*3+2] = minV.z + Float(q[i*3+2]) / 65535.0 * spanV.z
            }
            let t = base.advanced(by: nv * 6).assumingMemoryBound(to: UInt16.self)
            for i in 0..<nv * 2 { uvs[i] = Float(t[i]) / 65535.0 }
            let ip = base.advanced(by: nv * 10).assumingMemoryBound(to: UInt16.self)
            for i in 0..<nf * 3 { idx[i] = ip[i] }
        }
        // smooth vertex normals from face normals (winding is CCW-outward,
        // verified against the car shell pack)
        for f in 0..<nf {
            let a = Int(idx[f*3]), b = Int(idx[f*3+1]), c = Int(idx[f*3+2])
            let ax = verts[a*3], ay = verts[a*3+1], az = verts[a*3+2]
            let ux = verts[b*3]-ax, uy = verts[b*3+1]-ay, uz = verts[b*3+2]-az
            let vx = verts[c*3]-ax, vy = verts[c*3+1]-ay, vz = verts[c*3+2]-az
            let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx
            for v in [a, b, c] {
                norms[v*3] += nx; norms[v*3+1] += ny; norms[v*3+2] += nz
            }
        }
        for i in 0..<nv {
            let nx = norms[i*3], ny = norms[i*3+1], nz = norms[i*3+2]
            let l = max(1e-6, sqrtf(nx*nx + ny*ny + nz*nz))
            norms[i*3] = nx/l; norms[i*3+1] = ny/l; norms[i*3+2] = nz/l
        }
        let vData = Data(bytes: &verts, count: nv * 12)
        let nData = Data(bytes: &norms, count: nv * 12)
        let tData = Data(bytes: &uvs, count: nv * 8)
        let iData = Data(bytes: &idx, count: nf * 6)
        let vSrc = SCNGeometrySource(data: vData, semantic: .vertex, vectorCount: nv,
                                     usesFloatComponents: true, componentsPerVector: 3,
                                     bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
        let nSrc = SCNGeometrySource(data: nData, semantic: .normal, vectorCount: nv,
                                     usesFloatComponents: true, componentsPerVector: 3,
                                     bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
        let tSrc = SCNGeometrySource(data: tData, semantic: .texcoord, vectorCount: nv,
                                     usesFloatComponents: true, componentsPerVector: 2,
                                     bytesPerComponent: 4, dataOffset: 0, dataStride: 8)
        let el = SCNGeometryElement(data: iData, primitiveType: .triangles,
                                    primitiveCount: nf, bytesPerIndex: 2)
        return SCNGeometry(sources: [vSrc, nSrc, tSrc], elements: [el])
    }

    static func node() -> SCNNode {
        let g = geometry()
        g.materials = [material()]
        return SCNNode(geometry: g)
    }
}
