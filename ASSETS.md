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

## Sources/CarFlopper/HoodLinerAsset.swift — hood underside liner mesh
- Derived from the CC0 "Muscle Car" hood faces listed above (grab3d.com).
- License: CC0 1.0 Universal (public domain).
- Modifications: offset 15mm toward the underside along the hood vertex normals; inset 5% in x/z about the hood center so a painted perimeter stays visible; quantized uint16 packing with normals rebuilt at load.

## Sources/CarFlopper/GarageTexBlob.swift — garage floor and wall photo textures
- Floor: "Concrete034" by ambientCG — https://ambientcg.com/view?id=Concrete034
- Direct file: https://ambientcg.com/get?file=Concrete034_1K-JPG.zip (downloaded 2026-11-01, 3,657,575 bytes)
- Walls: "Concrete Block Wall" by Poly Haven — https://polyhaven.com/a/concrete_block_wall
- Direct file: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_block_wall/concrete_block_wall_diff_1k.jpg (downloaded 2026-11-02, 848,947 bytes)
- License: CC0 1.0 Universal (public domain) as stated by ambientCG (floor) and Poly Haven (walls); no attribution required, credited here anyway.
- Replaced 2026-11-02: ambientCG Bricks076C read as rough castle masonry in-game; swapped for concrete block wall brightened/desaturated into painted cinderblock.
- Modifications: color maps re-encoded as 1024px JPEG; floor darkened 45%; wall map desaturated and brightened to the two in-game painted-wall tones (light north/west, dark south/east); normal/roughness/AO maps dropped (in-code PBR scalars instead).

