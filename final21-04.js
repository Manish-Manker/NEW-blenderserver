// stabel code for blender render server 

const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { text } = require('stream/consumers');

const app = express();
const PORT = 3020;

app.use(cors());
app.use(fileUpload());

app.post('/render', async (req, res) => {
  const uploadDir = path.resolve(__dirname, 'uploads');
  const renderDir = path.resolve(__dirname, 'renders');
  const textureDir = path.join(uploadDir, 'textures'); 
  const timestamp = Date.now();
  const blendPath = path.join(uploadDir, `scene_${timestamp}.blend`);
  const outputPath = path.join(uploadDir, `render_${timestamp}.png`);
  const savedRenderPath = path.join(renderDir, `render_${timestamp}.png`);
  const scriptPath = path.join(uploadDir, `script_${timestamp}.py`);

  try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir);
    if (!fs.existsSync(textureDir)) fs.mkdirSync(textureDir);

    const { blendFile, textureFile } = req.files || {};

    if (!blendFile || !textureFile ) {
      return res.status(400).send('Missing blendFile, textureFile  ->');
    }

    if (!blendFile.name.endsWith('.blend')) {
      return res.status(400).send('Only .blend files are supported.');
    }

    if (!['image/png', 'image/jpeg'].includes(textureFile.mimetype)) {
      return res.status(400).send('Only PNG or JPEG textures are supported.');
    }

    await blendFile.mv(blendPath);
    await textureFile.mv(path.join(textureDir, textureFile.name));

    const blenderScript = `
import bpy
import os
import sys

def pack_image(image_path):
    try:
        image = bpy.data.images.load(image_path)
        image.pack()
        return image
    except Exception as e:
        print(f"Error packing image: {e}")
        return None

def replace_texture_on_mesh(image, mesh_name):
    try:
        obj = bpy.data.objects.get(mesh_name)
        if not obj:
            print(f"Object with name '{mesh_name}' not found.")
            return False

        if len(obj.data.materials) == 0:
            print(f"Object {mesh_name} has no materials.")
            return False

        for material in obj.data.materials:
            if material.use_nodes:
                for node in material.node_tree.nodes:
                    if node.type == 'TEX_IMAGE':
                        node.image = image
                        print(f"Replaced texture for {mesh_name} with image {image.name}.")
                        return True

        print(f"No texture node found for material in {mesh_name}.")
        return False
    except Exception as e:
        print(f"Error replacing texture: {e}")
        return False

def set_render_settings(output_path):
    try:
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'

        # Enable GPU rendering
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'CUDA'  # Use 'OPENCL' for AMD GPUs
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'

        # Set render settings
        scene.cycles.samples = 1024
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
        scene.cycles.use_adaptive_sampling = True

        scene.render.resolution_x = 1080
        scene.render.resolution_y = 1080
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = output_path

        scene.view_settings.view_transform = 'Filmic'
        scene.view_settings.look = 'Medium High Contrast'
    except Exception as e:
        print(f"Error setting render settings: {e}")

def render_scene():
    try:
        bpy.ops.render.render(write_still=True)
        print("Render completed successfully.")
    except Exception as e:
        print(f"Error during render: {e}")

def main():
    try:
        blend_path = r"${blendPath.replace(/\\/g, '\\\\')}"
        texture_path = r"${path.join(textureDir, textureFile.name).replace(/\\/g, '\\\\')}"
        mesh_name = "replacer"

        bpy.ops.wm.open_mainfile(filepath=blend_path)

        # Pack texture image into the .blend file
        image = pack_image(texture_path)
        if not image:
            raise Exception("Failed to pack image.")

        # Replace texture on the specified mesh
        if not replace_texture_on_mesh(image, mesh_name):
            raise Exception("Failed to replace texture on mesh.")

        # Set render settings
        set_render_settings(r"${outputPath.replace(/\\/g, '\\\\')}")

        # Render the scene
        render_scene()

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

main()
`;

    fs.writeFileSync(scriptPath, blenderScript);

    const BLENDER_PATH = '"C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe"';
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
      try {
        // Delete the output image from the uploads folder
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          console.log(`🗑️ Deleted output image from uploads folder: ${outputPath}`);
        }
    
        // Delete the texture image from the textures folder
        const texturePath = path.join(textureDir, textureFile.name);
        if (fs.existsSync(texturePath)) {
          fs.unlinkSync(texturePath);
          console.log(`🗑️ Deleted texture image from textures folder: ${texturePath}`);
        }
    
        // Optionally, delete the .blend file and script file if needed
        if (fs.existsSync(blendPath)) {
          fs.unlinkSync(blendPath);
          console.log(`🗑️ Deleted .blend file: ${blendPath}`);
        }
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
          console.log(`🗑️ Deleted script file: ${scriptPath}`);
        }
      } catch (cleanupErr) {
        console.error('❌ Error during cleanup:', cleanupErr);
      }
    
      if (err) {
        console.error('❌ Send error:', err);
      }
    });

  } catch (err) {
    console.error('❌ Render error:', err);
    res.status(500).json({ error: 'Render failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Render server running at http://localhost:${PORT}`);
});
