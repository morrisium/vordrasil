import cv2
import json
import os

# 1. Get the directory where THIS script (findcity.py) actually lives
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Build absolute paths to your images
# Change these filenames if your actual files are named differently!
MAP_PATH = os.path.join(SCRIPT_DIR, 'images', 'world_map.png')  
STAMP_PATH = os.path.join(SCRIPT_DIR, 'images\worldmap_icons', 'hafngard.png')   
OUTPUT_JSON = os.path.join(SCRIPT_DIR, 'cities.json')
PREVIEW_PATH = os.path.join(SCRIPT_DIR, 'images', 'preview.png')

# Leaflet coordinate constraints
MAP_HEIGHT = 12288 

print("Checking paths:")
print(f"Looking for map at: {MAP_PATH} -> {'FOUND' if os.path.exists(MAP_PATH) else '❌ NOT FOUND'}")
print(f"Looking for stamp at: {STAMP_PATH} -> {'FOUND' if os.path.exists(STAMP_PATH) else '❌ NOT FOUND'}\n")

def find_city_coordinates():
    # 1. Read images using OpenCV
    large_map = cv2.imread(MAP_PATH)
    template = cv2.imread(STAMP_PATH)
    
    if large_map is None:
        print(f"❌ Failed to load master map from {MAP_PATH}")
        return
    if template is None:
        print(f"❌ Failed to load city stamp from {STAMP_PATH}")
        return
        
    stamp_h, stamp_w = template.shape[:2]

    # 2. Run Template Matching
    print("Scanning the world map...")
    result = cv2.matchTemplate(large_map, template, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)

    if max_val < 0.8:
        print(f"⚠️ Warning: Low matching confidence ({max_val * 100:.1f}%)")
    else:
        print(f"✅ City matched with {max_val * 100:.1f}% confidence!")

    # Top-left match coordinate
    top_left_x, top_left_y = max_loc
    
    # Bottom-right coordinate (required to draw the bounding box)
    bottom_right_x = top_left_x + stamp_w
    bottom_right_y = top_left_y + stamp_h

    # Translate to your custom coordinate system
    center_x = top_left_x + (stamp_w // 2)
    center_y = top_left_y + (stamp_h // 2)
    leaflet_y = MAP_HEIGHT - center_y

    # 3. Create a low-res visual confirmation preview
    # Make a copy of the map so we don't draw on your actual high-res file!
    preview_img = large_map.copy()

    # Draw a bold red rectangle around the matched area
    # (Color is in BGR format: (0, 0, 255) is pure Red. Thickness is 15px so it shows on 16k)
    cv2.rectangle(
        preview_img, 
        (top_left_x, top_left_y), 
        (bottom_right_x, bottom_right_y), 
        (0, 0, 255), 
        15
    )

    # Scale the 16k image down to a fast-loading 1000px wide preview
    preview_width = 1000
    aspect_ratio = large_map.shape[0] / large_map.shape[1] # height / width
    preview_height = int(preview_width * aspect_ratio)
    
    resized_preview = cv2.resize(preview_img, (preview_width, preview_height), interpolation=cv2.INTER_AREA)

    # Save the visual confirmation file as a lightweight JPG
    cv2.imwrite(PREVIEW_PATH, resized_preview, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    print(f"📸 Visual preview saved to: '{PREVIEW_PATH}'")

    # 4. Save Coordinate Data to JSON
    city_data = {
        "Hafngard": {
            "x": int(center_x),
            "y": int(leaflet_y),
            "width": int(stamp_w),
            "height": int(stamp_h)
        }
    }

    with open(OUTPUT_JSON, 'w') as f:
        json.dump(city_data, f, indent=4)
        
    print(f"🎉 JSON Saved to '{OUTPUT_JSON}'!")
    print(f"Found at Leaflet Coordinates: X: {center_x}, Y: {leaflet_y}")

if __name__ == "__main__":
    find_city_coordinates()