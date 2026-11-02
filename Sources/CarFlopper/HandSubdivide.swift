import SceneKit

// MARK: - Load-time Loop subdivision for the embedded hand mesh.
// Run 166 review: the 8120-vert hand reads angular - faceted normal field on
// the back/web and a segmented silhouette - and per-vertex color smoothing
// alone cannot fix a geometric normal field. One Loop pass (8120 -> 32480
// verts, 12728 -> 50912 tris) smooths the normal field and silhouette for all
// five poses. Applied at load after HandPoseV2 overrides and HandShadeV2
// colors, so the offline pose pipeline and bake blobs stay untouched.
//
// Determinism contract (morpher safety): even verts keep the input order,
// odd verts follow sorted edge keys, faces follow input order. Two meshes of
// the same topology subdivide to vertex-for-vertex corresponding outputs, so
// morpher base/target pairs stay aligned.
//
// Boundary rule: wrist-cut boundary verts are PINNED (exact positions and
// colors) so the measured cuff seal geometry is preserved; boundary edge
// midpoints use the 1/2 rule.
//
// Pinning (run 171 experiment): `pin` flags the fingernail shell plus its
// one-ring skin neighborhood. Those even verts keep their EXACT input
// positions and colors, and odd verts between two pinned verts use the 1/2
// midpoint, so the nail region renders with the pre-subdivision geometry
// (run 167/170 nail mottle appeared only with subdivision; this isolates
// whether the mechanism lives in nail-area geometry). All other skin still
// Loop-smooths normally.
enum HandSubdivide {

    static func subdivide(_ g: SCNGeometry, pin: [Bool]? = nil) -> SCNGeometry {
        guard let vSrc = g.sources.first(where: { $0.semantic == .vertex }),
              let el = g.elements.first, el.primitiveType == .triangles else { return g }
        let nv = vSrc.vectorCount
        var verts = [SIMD3<Float>](repeating: .zero, count: nv)
        vSrc.data.withUnsafeBytes { ptr in
            let f = ptr.bindMemory(to: Float.self)
            let stride = vSrc.dataStride / 4
            for i in 0..<nv {
                verts[i] = SIMD3<Float>(f[i * stride + vSrc.dataOffset / 4],
                                        f[i * stride + vSrc.dataOffset / 4 + 1],
                                        f[i * stride + vSrc.dataOffset / 4 + 2])
            }
        }
        var cols = [SIMD4<Float>](repeating: SIMD4<Float>(1, 1, 1, 1), count: nv)
        var hasCol = false
        if let cSrc = g.sources.first(where: { $0.semantic == .color }) {
            hasCol = true
            cSrc.data.withUnsafeBytes { ptr in
                let f = ptr.bindMemory(to: Float.self)
                let stride = cSrc.dataStride / 4
                for i in 0..<nv {
                    cols[i] = SIMD4<Float>(f[i * stride + cSrc.dataOffset / 4],
                                            f[i * stride + cSrc.dataOffset / 4 + 1],
                                            f[i * stride + cSrc.dataOffset / 4 + 2],
                                            f[i * stride + cSrc.dataOffset / 4 + 3])
                }
            }
        }
        // Indices (UInt16 or Int32).
        let nf = el.primitiveCount
        var tris = [SIMD3<Int>](repeating: .zero, count: nf)
        el.data.withUnsafeBytes { ptr in
            if el.bytesPerIndex == 2 {
                let u = ptr.bindMemory(to: UInt16.self)
                for i in 0..<nf { tris[i] = SIMD3<Int>(Int(u[i * 3]), Int(u[i * 3 + 1]), Int(u[i * 3 + 2])) }
            } else {
                let u = ptr.bindMemory(to: Int32.self)
                for i in 0..<nf { tris[i] = SIMD3<Int>(Int(u[i * 3]), Int(u[i * 3 + 1]), Int(u[i * 3 + 2])) }
            }
        }

        // Edge map: sorted key -> (a, b, opposite verts, face count).
        struct EdgeInfo { var a: Int; var b: Int; var opp: [Int]; var odd: Int }
        var edges = [UInt64: EdgeInfo]()
        for (fi, t) in tris.enumerated() {
            _ = fi
            let tri = [t.x, t.y, t.z]
            for e in 0..<3 {
                let a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3]
                let lo = min(a, b), hi = max(a, b)
                let key = UInt64(lo) << 32 | UInt64(hi)
                if var info = edges[key] {
                    info.opp.append(c)
                    edges[key] = info
                } else {
                    edges[key] = EdgeInfo(a: lo, b: hi, opp: [c], odd: 0)
                }
            }
        }
        let sortedKeys = edges.keys.sorted()
        // Boundary: edges in exactly one face.
        var boundaryEdge = Set<UInt64>()
        for (k, info) in edges where info.opp.count == 1 { boundaryEdge.insert(k) }
        var isBoundaryVert = [Bool](repeating: false, count: nv)
        for k in boundaryEdge {
            let info = edges[k]!
            isBoundaryVert[info.a] = true
            isBoundaryVert[info.b] = true
        }
        func isPinned(_ x: Int) -> Bool {
            if isBoundaryVert[x] { return true }
            if let pin = pin, x < pin.count, pin[x] { return true }
            return false
        }
        // Vertex adjacency (interior smoothing needs full neighbor ring).
        var nbrs = [Set<Int>](repeating: Set(), count: nv)
        for t in tris {
            nbrs[t.x].insert(t.y); nbrs[t.x].insert(t.z)
            nbrs[t.y].insert(t.x); nbrs[t.y].insert(t.z)
            nbrs[t.z].insert(t.x); nbrs[t.z].insert(t.y)
        }

        var outV = [SIMD3<Float>](repeating: .zero, count: nv + sortedKeys.count)
        var outC = [SIMD4<Float>](repeating: SIMD4<Float>(1, 1, 1, 1), count: nv + sortedKeys.count)
        // Even verts.
        for v in 0..<nv {
            if isPinned(v) {
                outV[v] = verts[v]      // pinned: cuff seal + tool contact unchanged
                outC[v] = cols[v]
                continue
            }
            let nb = nbrs[v]
            let n = Float(nb.count)
            guard n >= 3 else { outV[v] = verts[v]; outC[v] = cols[v]; continue }
            let cs = 0.375 + 0.25 * cosf(2 * Float.pi / n)
            let beta = (1.0 / n) * (0.625 - cs * cs)
            var p = verts[v] * (1 - n * beta)
            var c = cols[v] * (1 - n * beta)
            for w in nb { p += verts[w] * beta; c += cols[w] * beta }
            outV[v] = p; outC[v] = c
        }
        // Odd verts in sorted edge order (determinism for morpher pairs).
        for (oi, k) in sortedKeys.enumerated() {
            var info = edges[k]!
            info.odd = nv + oi
            edges[k] = info
            let a = info.a, b = info.b
            let idx = nv + oi
            if isPinned(a) && isPinned(b) {
                outV[idx] = 0.5 * (verts[a] + verts[b])   // contact band: chord midpoint, no Loop pull
                outC[idx] = 0.5 * (cols[a] + cols[b])
            } else if info.opp.count >= 2 {
                outV[idx] = 0.375 * (verts[a] + verts[b]) + 0.125 * (verts[info.opp[0]] + verts[info.opp[1]])
                outC[idx] = 0.375 * (cols[a] + cols[b]) + 0.125 * (cols[info.opp[0]] + cols[info.opp[1]])
            } else {
                outV[idx] = 0.5 * (verts[a] + verts[b])
                outC[idx] = 0.5 * (cols[a] + cols[b])
            }
        }
        // Faces: each tri -> 4, input face order.
        var newTris = [UInt16](repeating: 0, count: nf * 12)
        var w = 0
        for t in tris {
            let t3 = [t.x, t.y, t.z]
            var m = [Int](repeating: 0, count: 3)
            for e in 0..<3 {
                let lo = min(t3[e], t3[(e + 1) % 3]), hi = max(t3[e], t3[(e + 1) % 3])
                m[e] = edges[UInt64(lo) << 32 | UInt64(hi)]!.odd
            }
            let quad: [Int] = [t3[0], m[0], m[2], m[0], t3[1], m[1], m[2], m[1], t3[2], m[0], m[1], m[2]]
            for q in quad { newTris[w] = UInt16(q); w += 1 }
        }
        let outNF = nf * 4
        // Smooth normals from faces.
        var norms = [SIMD3<Float>](repeating: .zero, count: outV.count)
        for i in 0..<outNF {
            let a = Int(newTris[i * 3]), b = Int(newTris[i * 3 + 1]), c = Int(newTris[i * 3 + 2])
            let n = simd_cross(outV[b] - outV[a], outV[c] - outV[a])
            norms[a] += n; norms[b] += n; norms[c] += n
        }
        for i in 0..<norms.count {
            let l = simd_length(norms[i])
            norms[i] = l > 1e-6 ? norms[i] / l : SIMD3<Float>(0, 1, 0)
        }

        var flatV = [Float](); flatV.reserveCapacity(outV.count * 3)
        var flatN = [Float](); flatN.reserveCapacity(outV.count * 3)
        for i in 0..<outV.count {
            flatV.append(outV[i].x); flatV.append(outV[i].y); flatV.append(outV[i].z)
            flatN.append(norms[i].x); flatN.append(norms[i].y); flatN.append(norms[i].z)
        }
        let vData = flatV.withUnsafeBytes { Data($0) }
        let nData = flatN.withUnsafeBytes { Data($0) }
        let iData = newTris.withUnsafeBytes { Data($0) }
        var srcs = [
            SCNGeometrySource(data: vData, semantic: .vertex, vectorCount: outV.count,
                              usesFloatComponents: true, componentsPerVector: 3,
                              bytesPerComponent: 4, dataOffset: 0, dataStride: 12),
            SCNGeometrySource(data: nData, semantic: .normal, vectorCount: outV.count,
                              usesFloatComponents: true, componentsPerVector: 3,
                              bytesPerComponent: 4, dataOffset: 0, dataStride: 12),
        ]
        if hasCol {
            var flatC = [Float](); flatC.reserveCapacity(outC.count * 4)
            for c in outC { flatC.append(c.x); flatC.append(c.y); flatC.append(c.z); flatC.append(c.w) }
            let cData = flatC.withUnsafeBytes { Data($0) }
            srcs.append(SCNGeometrySource(data: cData, semantic: .color, vectorCount: outV.count,
                                          usesFloatComponents: true, componentsPerVector: 4,
                                          bytesPerComponent: 4, dataOffset: 0, dataStride: 16))
        }
        let outEl = SCNGeometryElement(data: iData, primitiveType: .triangles,
                                       primitiveCount: outNF, bytesPerIndex: 2)
        let out = SCNGeometry(sources: srcs, elements: [outEl])
        out.materials = g.materials
        return out
    }
}
