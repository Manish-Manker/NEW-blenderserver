
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
    scene.cycles.samples = 1024
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

def render():
    print(f"📷 Rendering to: {bpy.context.scene.render.filepath}")
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(bpy.context.scene.render.filepath):
        raise Exception("Render output not found after rendering.")
    print("🎯 Render complete")

def main():
    try:
        bpy.ops.wm.open_mainfile(filepath=r"C:\\Users\\yash\\Desktop\\blender shear\\uploads\\scene_1744809890329.blend")
        validate_scene()
        set_render_settings(r"C:\\Users\\yash\\Desktop\\blender shear\\uploads\\render_1744809890329.png")
        render()
    except Exception as e:
        print("❌ ERROR:", e)
        sys.exit(1)

main()
