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
  const uploadDir = path.resolve(__dirname, 'uploads');
  const renderDir = path.resolve(__dirname, 'renders');
  const timestamp = Date.now();
  const blendPath = path.join(uploadDir, `scene_${timestamp}.blend`);
  const outputPath = path.join(uploadDir, `render_${timestamp}.png`);
  const savedRenderPath = path.join(renderDir, `render_${timestamp}.png`);
  const scriptPath = path.join(uploadDir, `script_${timestamp}.py`);

  try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir);

    const { blendFile } = req.files || {};

    if (!blendFile) {
      return res.status(400).send('Missing blendFile');
    }

    if (!blendFile.name.endsWith('.blend')) {
      return res.status(400).send('Only .blend files are supported.');
    }

    await blendFile.mv(blendPath);

    const blenderScript = `
import bpy
import os
import sys

def validate_scene():
    cameras = [obj for obj in bpy.data.objects if obj.type == 'CAMERA']
    if not cameras:
        raise Exception("No camera found in the .blend file.")
    
    lights = [obj for obj in bpy.data.objects if obj.type == 'LIGHT']
    if not lights:
        raise Exception("No light objects found in the .blend file.")

def set_render_settings(output_path):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'CUDA'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 512
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.use_adaptive_sampling = True

    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 0
    scene.render.filepath = output_path

    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'

def render():
    print(f"📷 Rendering to: {bpy.context.scene.render.filepath}")
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(bpy.context.scene.render.filepath):
        raise Exception("Render output not found after rendering.")
    print("🎯 Render complete")

def main():
    try:
        bpy.ops.wm.open_mainfile(filepath=r"${blendPath.replace(/\\/g, '\\\\')}")
        validate_scene()
        set_render_settings(r"${outputPath.replace(/\\/g, '\\\\')}")
        render()
    except Exception as e:
        print("❌ ERROR:", e)
        sys.exit(1)

main()
`;

    fs.writeFileSync(scriptPath, blenderScript);

    const BLENDER_PATH = '"C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe"';
    const command = `${BLENDER_PATH} -b -P "${scriptPath}"`;

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(command, { timeout: 600000 }, (err, stdout, stderr) => {
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

    fs.copyFileSync(outputPath, savedRenderPath);

    res.sendFile(outputPath, (err) => {
      [blendPath, scriptPath].forEach(p => { try { fs.unlinkSync(p); } catch {} });
      if (err) console.error('Send error:', err);
    });

  } catch (err) {
    console.error('❌ Render error:', err);
    res.status(500).json({ error: 'Render failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Render server running at http://localhost:${PORT}`);
});
