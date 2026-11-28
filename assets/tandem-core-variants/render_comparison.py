from PIL import Image, ImageDraw
import re

orig = Image.open(".superpowers/brainstorm/20599-1787840406/content/tandem-logo-reference.png").convert("RGBA")
w, h = orig.size

# We can sample the Bezier curves from tandem-flat-orange.svg
# Let us parse the Cubic Bezier curves to render pixel-perfect polygon
with open("assets/tandem-core-variants/tandem-flat-orange.svg") as f:
    svg_txt = f.read()

m = re.search(r'\bd="([^"]+)"', svg_txt)
d_val = m.group(1)

subpaths = d_val.split("Z")

def eval_cubic(p0, p1, p2, p3, t):
    it = 1.0 - t
    x = it**3 * p0[0] + 3*it**2*t * p1[0] + 3*it*t**2 * p2[0] + t**3 * p3[0]
    y = it**3 * p0[1] + 3*it**2*t * p1[1] + 3*it*t**2 * p2[1] + t**3 * p3[1]
    return (x, y)

def parse_bezier_path(sp):
    cmds = sp.strip().replace("M", " M ").replace("C", " C ").split()
    pts = []
    curr = None
    i = 0
    while i < len(cmds):
        cmd = cmds[i]
        if cmd == "M":
            x, y = map(float, cmds[i+1].split(","))
            curr = (x, y)
            pts.append(curr)
            i += 2
        elif cmd == "C":
            c1 = tuple(map(float, cmds[i+1].split(",")))
            c2 = tuple(map(float, cmds[i+2].split(",")))
            target = tuple(map(float, cmds[i+3].split(",")))
            # Sample curve with 8 segments
            for step in range(1, 9):
                t = step / 8.0
                pts.append(eval_cubic(curr, c1, c2, target, t))
            curr = target
            i += 4
        else:
            i += 1
    return pts

outer_pts = parse_bezier_path(subpaths[0])
inner_pts = parse_bezier_path(subpaths[1])

print(f"Sampled Bezier: outer={len(outer_pts)} points, inner={len(inner_pts)} points")

canvas = Image.new("RGBA", (w, h), (0, 0, 0, 255))
draw = ImageDraw.Draw(canvas)

# Background squircle
draw.rounded_rectangle([0, 0, w, h], radius=275, fill=(0, 0, 0, 255))

# Ribbon
draw.polygon(outer_pts, fill=(255, 255, 255, 255))
draw.polygon(inner_pts, fill=(0, 0, 0, 255))

# Flat core
draw.ellipse([628 - 104, 612 - 104, 628 + 104, 612 + 104], fill=(255, 56, 17, 255))

# Save side-by-side
comp = Image.new("RGBA", (1024, 512), (10, 10, 10, 255))
comp.paste(orig.resize((512, 512), Image.Resampling.LANCZOS), (0, 0))
comp.paste(canvas.resize((512, 512), Image.Resampling.LANCZOS), (512, 0))
comp.save("assets/tandem-core-variants/side-by-side-comparison.png")

# Also save standalone 512x512 PNG of the flat vector logo
canvas.resize((512, 512), Image.Resampling.LANCZOS).save("assets/tandem-core-variants/tandem-flat-rendered-512.png")
print("Saved side-by-side-comparison.png and tandem-flat-rendered-512.png successfully!")
