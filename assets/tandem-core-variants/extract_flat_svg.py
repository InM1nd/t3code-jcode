from PIL import Image
import math
import os

SRC_PATH = ".superpowers/brainstorm/20599-1787840406/content/tandem-logo-reference.png"
OUT_DIR = "assets/tandem-core-variants"

def smooth_polyline(points, window=6):
    n = len(points)
    smoothed = []
    for i in range(n):
        sx, sy, sw = 0.0, 0.0, 0.0
        for j in range(-window, window + 1):
            idx = (i + j) % n
            w = (window + 1) - abs(j)
            sx += points[idx][0] * w
            sy += points[idx][1] * w
            sw += w
        smoothed.append((round(sx / sw, 3), round(sy / sw, 3)))
    return smoothed

def catmull_rom_to_bezier(pts):
    n = len(pts)
    d = [f"M {pts[0][0]:.2f},{pts[0][1]:.2f}"]
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        
        c1x = p1[0] + (p2[0] - p0[0]) / 6.0
        c1y = p1[1] + (p2[1] - p0[1]) / 6.0
        c2x = p2[0] - (p3[0] - p1[0]) / 6.0
        c2y = p2[1] - (p3[1] - p1[1]) / 6.0
        
        d.append(f"C {c1x:.2f},{c1y:.2f} {c2x:.2f},{c2y:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    d.append("Z")
    return " ".join(d)

def main():
    img = Image.open(SRC_PATH).convert("RGBA")
    w, h = img.size
    cx, cy = 628, 612
    
    # 1. Identify ribbon pixels (threshold 28)
    grid = [[False]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            dist_c = math.hypot(x - cx, y - cy)
            if a > 40 and dist_c > 110:
                l = 0.299*r + 0.587*g + 0.114*b
                if l > 28:
                    grid[y][x] = True

    # 2. Outer contour tracing
    dirs = [(1,0), (1,1), (0,1), (-1,1), (-1,0), (-1,-1), (0,-1), (1,-1)]
    start_x, start_y = None, None
    for y in range(h):
        for x in range(w):
            if grid[y][x]:
                start_x, start_y = x, y
                break
        if start_x is not None:
            break

    curr = (start_x, start_y)
    dir_idx = 7
    outer_raw = [curr]
    while True:
        found = False
        search_dir = (dir_idx + 5) % 8
        for i in range(8):
            check_dir = (search_dir + i) % 8
            dx, dy = dirs[check_dir]
            nx, ny = curr[0] + dx, curr[1] + dy
            if 0 <= nx < w and 0 <= ny < h and grid[ny][nx]:
                curr = (nx, ny)
                dir_idx = check_dir
                found = True
                break
        if not found or curr == (start_x, start_y):
            break
        outer_raw.append(curr)

    # 3. Inner hole contour tracing
    hole_grid = [[False]*w for _ in range(h)]
    queue = [(cx, cy)]
    hole_grid[cy][cx] = True
    while queue:
        qx, qy = queue.pop()
        for dx, dy in [(-1,0), (1,0), (0,-1), (0,1)]:
            nx, ny = qx + dx, qy + dy
            if 0 <= nx < w and 0 <= ny < h and not grid[ny][nx] and not hole_grid[ny][nx]:
                hole_grid[ny][nx] = True
                queue.append((nx, ny))

    h_start_x, h_start_y = None, None
    for y in range(h):
        for x in range(w):
            if hole_grid[y][x]:
                h_start_x, h_start_y = x, y
                break
        if h_start_x is not None:
            break

    curr = (h_start_x, h_start_y)
    dir_idx = 7
    inner_raw = [curr]
    while True:
        found = False
        search_dir = (dir_idx + 5) % 8
        for i in range(8):
            check_dir = (search_dir + i) % 8
            dx, dy = dirs[check_dir]
            nx, ny = curr[0] + dx, curr[1] + dy
            if 0 <= nx < w and 0 <= ny < h and hole_grid[ny][nx]:
                curr = (nx, ny)
                dir_idx = check_dir
                found = True
                break
        if not found or curr == (h_start_x, h_start_y):
            break
        inner_raw.append(curr)

    print(f"Total raw points: outer={len(outer_raw)}, inner={len(inner_raw)}")

    # Smooth the polyline
    outer_smooth = smooth_polyline(outer_raw, window=8)
    inner_smooth = smooth_polyline(inner_raw, window=8)

    # Subsample points evenly for smooth cubic Bezier fitting
    # Outer perimeter is ~3000px, 48 points gives 1 spline per ~60px
    # Inner perimeter is ~1200px, 28 points gives 1 spline per ~42px
    num_outer_ctrl = 54
    num_inner_ctrl = 32

    outer_pts = [outer_smooth[int(i * len(outer_smooth) / num_outer_ctrl)] for i in range(num_outer_ctrl)]
    inner_pts = [inner_smooth[int(i * len(inner_smooth) / num_inner_ctrl)] for i in range(num_inner_ctrl)]

    outer_bezier = catmull_rom_to_bezier(outer_pts)
    inner_bezier = catmull_rom_to_bezier(inner_pts)
    combined_ribbon = f"{outer_bezier} {inner_bezier}"

    core_cx = 628.0
    core_cy = 612.0
    core_r = 104.0

    THEMES = {
        "orange": ("#ff3811", "Orange (Original)"),
        "green": ("#10e850", "Emerald Green"),
        "blue": ("#12a8ff", "Electric Blue"),
        "yellow": ("#ffc812", "Golden Yellow"),
        "purple": ("#ba41ff", "Neon Purple"),
        "cyan": ("#00f0ff", "Cyan Aqua"),
        "pink": ("#ff2e93", "Hot Pink / Magenta"),
    }

    # Generate SVGs
    for name, (color_hex, label) in THEMES.items():
        # 1. With dark squircle background
        svg_with_bg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="100%" height="100%">
  <!-- Background Squircle Container -->
  <rect id="bg" width="1254" height="1254" rx="275" fill="#000000"/>

  <!-- Flat White Ribbon (Continuous Curved Toroid Loop) -->
  <path id="ribbon" fill="#FFFFFF" fill-rule="evenodd" d="{combined_ribbon}"/>

  <!-- Flat Colored Core (Target for Lottie scale/pulse/glow) -->
  <circle id="core" cx="{core_cx:.1f}" cy="{core_cy:.1f}" r="{core_r:.1f}" fill="{color_hex}"/>
</svg>'''
        with open(os.path.join(OUT_DIR, f"tandem-flat-{name}.svg"), "w", encoding="utf-8") as f:
            f.write(svg_with_bg)

        # 2. Transparent background version (pure mark)
        svg_transparent = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="100%" height="100%">
  <!-- Flat White Ribbon -->
  <path id="ribbon" fill="#FFFFFF" fill-rule="evenodd" d="{combined_ribbon}"/>

  <!-- Flat Colored Core -->
  <circle id="core" cx="{core_cx:.1f}" cy="{core_cy:.1f}" r="{core_r:.1f}" fill="{color_hex}"/>
</svg>'''
        with open(os.path.join(OUT_DIR, f"tandem-flat-transparent-{name}.svg"), "w", encoding="utf-8") as f:
            f.write(svg_transparent)

    # Primary aliases
    with open(os.path.join(OUT_DIR, "tandem-flat.svg"), "w", encoding="utf-8") as f:
        f.write(open(os.path.join(OUT_DIR, "tandem-flat-orange.svg")).read())

    with open(os.path.join(OUT_DIR, "tandem-flat-transparent.svg"), "w", encoding="utf-8") as f:
        f.write(open(os.path.join(OUT_DIR, "tandem-flat-transparent-orange.svg")).read())

    print("All flat SVGs generated successfully!")

if __name__ == "__main__":
    main()
