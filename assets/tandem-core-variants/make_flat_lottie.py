import json
import re

# Read the exact Bezier path from tandem-flat-orange.svg
with open("assets/tandem-core-variants/tandem-flat-orange.svg") as f:
    svg_txt = f.read()

m = re.search(r'\bd="([^"]+)"', svg_txt)
d_val = m.group(1)
subpaths = d_val.split("Z")

def parse_bezier_to_lottie_shape(sp):
    cmds = sp.strip().replace("M", " M ").replace("C", " C ").split()
    verts = []
    in_tang = []
    out_tang = []
    
    i = 0
    curr = None
    first = None
    while i < len(cmds):
        cmd = cmds[i]
        if cmd == "M":
            x, y = map(float, cmds[i+1].split(","))
            curr = [x, y]
            first = curr
            verts.append(curr)
            in_tang.append([0.0, 0.0]) # will be updated at the end for closed loop
            i += 2
        elif cmd == "C":
            c1 = list(map(float, cmds[i+1].split(",")))
            c2 = list(map(float, cmds[i+2].split(",")))
            target = list(map(float, cmds[i+3].split(",")))
            
            # In Lottie, out_tangent of curr is relative to curr:
            out_tang.append([round(c1[0] - curr[0], 2), round(c1[1] - curr[1], 2)])
            
            # in_tangent of target is relative to target:
            if i + 4 < len(cmds) and cmds[i+4] == "C":
                verts.append(target)
                in_tang.append([round(c2[0] - target[0], 2), round(c2[1] - target[1], 2)])
            else:
                # closing to first vertex
                in_tang[0] = [round(c2[0] - first[0], 2), round(c2[1] - first[1], 2)]
            
            curr = target
            i += 4
        else:
            i += 1
            
    return {
        "c": True,
        "v": verts,
        "i": in_tang,
        "o": out_tang
    }

outer_shape = parse_bezier_to_lottie_shape(subpaths[0])
inner_shape = parse_bezier_to_lottie_shape(subpaths[1])

print(f"Lottie shapes: outer={len(outer_shape['v'])} verts, inner={len(inner_shape['v'])} verts")

# Generate Lottie JSON with flat design:
# Central core pulses gently (scale 100% -> 114% -> 100%)
lottie_anim = {
    "v": "5.7.4",
    "fr": 60,
    "ip": 0,
    "op": 180,
    "w": 1254,
    "h": 1254,
    "nm": "Tandem Flat Icon Animation",
    "ddd": 0,
    "assets": [],
    "layers": [
        # Layer 1: Flat Core Circle
        {
            "ddd": 0,
            "ind": 1,
            "ty": 4, # shape layer
            "nm": "Core",
            "sr": 1,
            "ks": {
                "o": {"a": 0, "k": 100},
                "r": {"a": 0, "k": 0},
                "p": {"a": 0, "k": [628, 612, 0]},
                "a": {"a": 0, "k": [0, 0, 0]},
                "s": {
                    "a": 1,
                    "k": [
                        {"t": 0, "s": [100, 100, 100], "i": {"x": [0.4], "y": [1.0]}, "o": {"x": [0.4], "y": [0.0]}},
                        {"t": 90, "s": [114, 114, 100], "i": {"x": [0.4], "y": [1.0]}, "o": {"x": [0.4], "y": [0.0]}},
                        {"t": 180, "s": [100, 100, 100]}
                    ]
                }
            },
            "shapes": [
                {
                    "ty": "gr",
                    "it": [
                        {"d": 1, "ty": "el", "s": {"a": 0, "k": [208, 208]}, "p": {"a": 0, "k": [0, 0]}, "nm": "Core Circle"},
                        {"ty": "fl", "c": {"a": 0, "k": [1.0, 0.22, 0.07, 1.0]}, "o": {"a": 0, "k": 100}, "nm": "Core Fill"},
                        {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}}
                    ],
                    "nm": "Core Group"
                }
            ]
        },
        # Layer 2: White Ribbon
        {
            "ddd": 0,
            "ind": 2,
            "ty": 4,
            "nm": "Ribbon",
            "sr": 1,
            "ks": {
                "o": {"a": 0, "k": 100},
                "r": {"a": 0, "k": 0},
                "p": {"a": 0, "k": [0, 0, 0]},
                "a": {"a": 0, "k": [0, 0, 0]},
                "s": {"a": 0, "k": [100, 100, 100]}
            },
            "shapes": [
                {
                    "ty": "gr",
                    "it": [
                        {"ty": "sh", "ks": {"a": 0, "k": outer_shape}, "nm": "Outer Loop"},
                        {"ty": "sh", "ks": {"a": 0, "k": inner_shape}, "nm": "Inner Hole"},
                        {"ty": "fl", "c": {"a": 0, "k": [1.0, 1.0, 1.0, 1.0]}, "o": {"a": 0, "k": 100}, "r": 2, "nm": "Ribbon Fill"},
                        {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}}
                    ],
                    "nm": "Ribbon Group"
                }
            ]
        },
        # Layer 3: Dark Background Container
        {
            "ddd": 0,
            "ind": 3,
            "ty": 4,
            "nm": "Background",
            "sr": 1,
            "ks": {
                "o": {"a": 0, "k": 100},
                "r": {"a": 0, "k": 0},
                "p": {"a": 0, "k": [627, 627, 0]},
                "a": {"a": 0, "k": [0, 0, 0]},
                "s": {"a": 0, "k": [100, 100, 100]}
            },
            "shapes": [
                {
                    "ty": "gr",
                    "it": [
                        {"d": 1, "ty": "rc", "s": {"a": 0, "k": [1254, 1254]}, "p": {"a": 0, "k": [0, 0]}, "r": 275, "nm": "Squircle"},
                        {"ty": "fl", "c": {"a": 0, "k": [0.0, 0.0, 0.0, 1.0]}, "o": {"a": 0, "k": 100}, "nm": "Background Fill"},
                        {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}}
                    ],
                    "nm": "Background Group"
                }
            ]
        }
    ]
}

with open("assets/tandem-core-variants/tandem-flat-animation.json", "w", encoding="utf-8") as f:
    json.dump(lottie_anim, f, indent=2)

print("Generated assets/tandem-core-variants/tandem-flat-animation.json successfully!")
