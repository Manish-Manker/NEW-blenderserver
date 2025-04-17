
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
        scene.render.resolution_x = 2048
        scene.render.resolution_y = 2048
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = output_path
        scene.cycles.samples = 2048
        scene.cycles.use_denoising = True
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
        blend_path = r"C:\\Users\\yash\\Desktop\\blender shear\\uploads\\scene_1744869889620.blend"
        texture_path = r"C:\\Users\\yash\\Desktop\\blender shear\\uploads\\textures\\1.png"
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
        set_render_settings(r"C:\\Users\\yash\\Desktop\\blender shear\\uploads\\render_1744869889620.png")

        # Render the scene
        render_scene()

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

main()
