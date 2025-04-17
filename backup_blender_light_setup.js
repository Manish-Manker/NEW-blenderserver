// index.js  with blender light setup
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3020;

app.use(cors());
app.use(fileUpload());

app.post('/render', async (req, res) => {
  console.log("rendering-->>>>");

  const uploadDir = path.resolve(__dirname, 'uploads');
  const timestamp = Date.now();
  const modelPath = path.join(uploadDir, `model_${timestamp}.glb`);
  const scriptPath = path.join(uploadDir, `script_${timestamp}.py`);
  const outputPath = path.join(uploadDir, `render_${timestamp}.png`);

  try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    await req.files.model.mv(modelPath);

    const blenderScript = `
import bpy
import os
import sys
from mathutils import Vector

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    if not os.path.exists(path):
        raise Exception(f"GLB not found at {path}")
    bpy.ops.import_scene.gltf(filepath=path)
    print("✅ GLB imported")

def combine_and_center():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise Exception("No mesh objects found in the scene after import.")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    obj.location = (0, 0, 0.5)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()
    print("✅ Mesh combined and centered")
    return obj

def setup_camera_from_scene():
    cams = [obj for obj in bpy.context.scene.objects if obj.type == 'CAMERA']
    if cams:
        bpy.context.scene.camera = cams[0]
        print("📷 Using camera from GLB")
        return True
    else:
        print("❌ No camera found in GLB")
        return False

def setup_default_camera(obj):
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    center = sum(bbox, Vector()) / 8
    height = max(v.z for v in bbox) - min(v.z for v in bbox)
    cam_y = 5
    cam_z = center.z + height * 0.3
    cam_x = 0
    bpy.ops.object.camera_add(location=(cam_x, -cam_y, cam_z))
    cam = bpy.context.active_object
    bpy.context.scene.camera = cam
    empty = bpy.data.objects.new("EmptyTarget", None)
    bpy.context.collection.objects.link(empty)
    empty.location = center
    constraint = cam.constraints.new(type='TRACK_TO')
    constraint.target = empty
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'
    cam.data.lens = 35
    cam.data.clip_end = 1000
    print("📸 Default camera added")

def setup_studio_lighting():
    # Simulate Blender's default Studio lighting
    bpy.ops.object.light_add(type='AREA', location=(5, -5, 5))
    light1 = bpy.context.object
    light1.data.energy = 800
    light1.data.size = 3

    bpy.ops.object.light_add(type='AREA', location=(-5, -5, 5))
    light2 = bpy.context.object
    light2.data.energy = 500
    light2.data.size = 2

    bpy.ops.object.light_add(type='AREA', location=(0, 5, 6))
    light3 = bpy.context.object
    light3.data.energy = 300
    light3.data.size = 4

    print("💡 Studio lighting setup complete")

def make_background_transparent():
    bpy.context.scene.render.film_transparent = True

def set_render_settings(output_path):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'CUDA'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 2048
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.use_adaptive_sampling = True

    scene.render.resolution_x = 2048
    scene.render.resolution_y = 2048
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 0

    scene.render.filepath = output_path

    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'
    print("🛠️ Render settings applied")

def render():
    print(f"📷 Rendering to: {bpy.context.scene.render.filepath}")
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(bpy.context.scene.render.filepath):
        print("❌ Render output file missing")
        sys.exit(1)
    print("🎯 Render complete")

def main():
    try:
        print("🚀 Starting render process")
        clean_scene()
        import_glb(r"${modelPath.replace(/\\/g, '\\\\')}")
        obj = combine_and_center()
        cam_used = setup_camera_from_scene()
        if not cam_used:
            setup_default_camera(obj)
        setup_studio_lighting()
        make_background_transparent()
        set_render_settings(r"${outputPath.replace(/\\/g, '\\\\')}")
        render()
    except Exception as e:
        print("❌ ERROR:", e)
        sys.exit(1)

main()
`;

    fs.writeFileSync(scriptPath, blenderScript);

    const BLENDER_PATH = '"C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe"';
    const command = `${BLENDER_PATH} -b -P "${scriptPath}"`;

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(command, { timeout: 600000, cwd: __dirname }, (err, stdout, stderr) => {
        console.error("📄 Blender STDOUT:\n", stdout);
        console.error("📄 Blender STDERR:\n", stderr);
        if (err || stderr.includes("ERROR") || stdout.includes("ERROR")) {
          return reject(new Error("Blender error occurred. Check logs above."));
        }
        resolve({ stdout, stderr });
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error("Render output missing");
    }

    res.sendFile(outputPath, (err) => {
      [modelPath, scriptPath, outputPath].forEach(p => { try { fs.unlinkSync(p); } catch { } });
      if (err) console.error('Send error:', err);
    });

  } catch (err) {
    console.error('Render error:', err);
    res.status(500).json({ error: 'Render failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Render server running at http://localhost:${PORT}`);
});
