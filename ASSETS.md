# Third-party assets

## Sources/CarFlopper/CarMeshAsset.swift — embedded car body mesh
- Source: "Muscle Car" by grab3d.com — https://grab3d.com/models/vehicles/muscle-car/
- Direct file: https://grab3d.com/dl/muscle-car/muscle-car.glb (downloaded 2026-10-29, 1,258,332 bytes)
- License: CC0 1.0 Universal (public domain) as stated on the model page; no attribution required, credited here anyway.
- Modifications: hood faces split into a separate hinged node; wheels split per corner and centered on their hubs; pastel materials replaced by in-code PBR materials; quantized int16 packing with normals rebuilt at load.

## Sources/CarFlopper/HandMeshAsset.swift — embedded first-person hand mesh
- Source: "Playerhands" by wmiler — https://opengameart.org/content/playerhands
- Direct file: https://opengameart.org/sites/default/files/hand.zip (downloaded 2026-10-30; MD5 mesh/animation + Blender source)
- License: CC0 1.0 Universal (public domain) as stated on the model page; no attribution required, credited here anyway.
- Modifications: forearm trimmed at the wrist; two baked poses (relaxed, grip) produced from the original skeleton via linear-blend skinning about each finger's knuckle axis; 1x Loop subdivision; quantized int16 packing with normals rebuilt at load.

## Downloaded for future unlock content (not yet shipped)
- "Sedan" by grab3d.com — https://grab3d.com/models/vehicles/sedan/ — CC0 1.0.

## Sources/CarFlopper/EngineMeshAsset.swift + EngineMeshBlob{ABC}.swift + EngineTexBlob.swift — embedded V8 engine mesh
- Source: "V8 Engine" by grab3d.com — https://grab3d.com/models/vehicles/v8-engine/
- Direct file: https://grab3d.com/dl/v8-engine/v8-engine.glb (downloaded 2026-11-01, 1,522,996 bytes)
- License: CC0 1.0 Universal (public domain) as stated on the model page; no attribution required, credited here anyway.
- Modifications: rotated so the crankshaft runs along z with the belt drive at +z (car front); 2048px base-color texture downscaled to 1024px JPEG; normal/metallic-roughness maps dropped (in-code PBR scalars instead); quantized uint16 packing with smooth normals rebuilt at load.
