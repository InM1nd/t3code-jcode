from PIL import Image
import colorsys
import math
import os

SRC_PATH = ".superpowers/brainstorm/20599-1787840406/content/tandem-logo-reference.png"
OUT_DIR = "assets/tandem-core-variants"

COLOR_CONFIGS = [
    {
        "name": "orange",
        "label": "Orange (Original)",
        "hue": 6.2,
        "sat_mult": 1.0,
        "val_mult": 1.0
    },
    {
        "name": "green",
        "label": "Emerald Green",
        "hue": 138.0,
        "sat_mult": 1.05,
        "val_mult": 1.0
    },
    {
        "name": "blue",
        "label": "Electric Blue",
        "hue": 218.0,
        "sat_mult": 1.05,
        "val_mult": 1.05
    },
    {
        "name": "yellow",
        "label": "Golden Yellow",
        "hue": 46.0,
        "sat_mult": 1.1,
        "val_mult": 1.0
    },
    {
        "name": "purple",
        "label": "Neon Purple",
        "hue": 278.0,
        "sat_mult": 1.05,
        "val_mult": 1.05
    },
    {
        "name": "cyan",
        "label": "Cyan Aqua",
        "hue": 182.0,
        "sat_mult": 1.05,
        "val_mult": 1.0
    },
    {
        "name": "pink",
        "label": "Hot Pink / Magenta",
        "hue": 328.0,
        "sat_mult": 1.05,
        "val_mult": 1.05
    },
]

def process():
    orig = Image.open(SRC_PATH).convert("RGBA")
    w, h = orig.size
    cx, cy = 628.0, 612.0
    
    # Pre-calculate masks and coordinates for pixels inside core circle
    # Core radius is ~106. Feather out to 109.
    r_inner = 103.0
    r_outer = 108.5
    
    core_coords = []
    for y in range(int(cy - r_outer - 2), int(cy + r_outer + 2)):
        for x in range(int(cx - r_outer - 2), int(cx + r_outer + 2)):
            d = math.hypot(x - cx, y - cy)
            if d <= r_outer:
                if d <= r_inner:
                    w_mask = 1.0
                else:
                    # Smooth cosine falloff
                    w_mask = 0.5 * (1.0 + math.cos(math.pi * (d - r_inner) / (r_outer - r_inner)))
                core_coords.append((x, y, w_mask))
                
    print(f"Core pixels to process: {len(core_coords)}")
    
    for cfg in COLOR_CONFIGS:
        name = cfg["name"]
        target_hue = cfg["hue"]
        sat_mult = cfg["sat_mult"]
        val_mult = cfg["val_mult"]
        
        img = orig.copy()
        pixels = img.load()
        orig_pixels = orig.load()
        
        if name == "orange":
            # Exact original copy
            out_path = os.path.join(OUT_DIR, f"tandem-core-{name}.png")
            img.save(out_path, optimize=True)
            print(f"Saved {out_path}")
            continue
            
        delta_hue = (target_hue - 6.2) / 360.0
        
        for x, y, mask in core_coords:
            r, g, b, a = orig_pixels[x, y]
            if a < 5:
                continue
                
            h_val, s_val, v_val = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            
            # Shift hue smoothly with weight
            new_h = (h_val + delta_hue * mask) % 1.0
            new_s = min(1.0, max(0.0, s_val * (1.0 + (sat_mult - 1.0) * mask)))
            new_v = min(1.0, max(0.0, v_val * (1.0 + (val_mult - 1.0) * mask)))
            
            nr, ng, nb = colorsys.hsv_to_rgb(new_h, new_s, new_v)
            
            # Blend by mask with original pixel
            final_r = int(round(nr * 255.0 * mask + r * (1.0 - mask)))
            final_g = int(round(ng * 255.0 * mask + g * (1.0 - mask)))
            final_b = int(round(nb * 255.0 * mask + b * (1.0 - mask)))
            
            pixels[x, y] = (final_r, final_g, final_b, a)
            
        out_path = os.path.join(OUT_DIR, f"tandem-core-{name}.png")
        img.save(out_path, optimize=True)
        print(f"Saved {out_path}")
        
        # Also create a crisp 128x128 preview
        thumb = img.resize((128, 128), Image.Resampling.LANCZOS)
        thumb_path = os.path.join(OUT_DIR, f"tandem-core-{name}-128.png")
        thumb.save(thumb_path, optimize=True)

if __name__ == "__main__":
    process()
