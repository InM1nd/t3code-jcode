import math
import os

OUT_DIR = "assets/tandem-core-variants"

THEMES = {
    "orange": {
        "title": "Orange (Original)",
        "core_center": "#ff3811",
        "core_base": "#d81400",
        "core_shadow": "#6d0000",
        "glow": "rgba(255, 56, 17, 0.45)",
        "glow_soft": "rgba(255, 56, 17, 0.0)",
        "accent": "#ff6838"
    },
    "green": {
        "title": "Emerald Green",
        "core_center": "#10e850",
        "core_base": "#00b836",
        "core_shadow": "#004d16",
        "glow": "rgba(16, 232, 80, 0.45)",
        "glow_soft": "rgba(16, 232, 80, 0.0)",
        "accent": "#4eff86"
    },
    "blue": {
        "title": "Electric Blue",
        "core_center": "#12a8ff",
        "core_base": "#0070f3",
        "core_shadow": "#002d7a",
        "glow": "rgba(18, 168, 255, 0.45)",
        "glow_soft": "rgba(18, 168, 255, 0.0)",
        "accent": "#66c4ff"
    },
    "yellow": {
        "title": "Golden Amber",
        "core_center": "#ffc812",
        "core_base": "#e59b00",
        "core_shadow": "#664200",
        "glow": "rgba(255, 200, 18, 0.45)",
        "glow_soft": "rgba(255, 200, 18, 0.0)",
        "accent": "#ffdf66"
    },
    "purple": {
        "title": "Neon Purple",
        "core_center": "#ba41ff",
        "core_base": "#8918e8",
        "core_shadow": "#3c0073",
        "glow": "rgba(186, 65, 255, 0.45)",
        "glow_soft": "rgba(186, 65, 255, 0.0)",
        "accent": "#d482ff"
    },
    "cyan": {
        "title": "Cyan Aqua",
        "core_center": "#00f0ff",
        "core_base": "#00b4d8",
        "core_shadow": "#004559",
        "glow": "rgba(0, 240, 255, 0.45)",
        "glow_soft": "rgba(0, 240, 255, 0.0)",
        "accent": "#73f7ff"
    },
    "pink": {
        "title": "Hot Pink / Magenta",
        "core_center": "#ff2e93",
        "core_base": "#d80068",
        "core_shadow": "#63002f",
        "glow": "rgba(255, 46, 147, 0.45)",
        "glow_soft": "rgba(255, 46, 147, 0.0)",
        "accent": "#ff75b8"
    }
}

def generate_svg(color_name="orange", is_animated=False):
    theme = THEMES.get(color_name, THEMES["orange"])
    
    # 512x512 Canvas
    # Center: (256, 256)
    # The ribbon is composed of smooth stylized intertwined tracks
    # Ribbon back, core with glow/body/highlight, and ribbon front
    
    anim_css = ""
    if is_animated:
        anim_css = """
    @keyframes pulseGlow {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.22); opacity: 0.95; }
    }
    @keyframes coreFloat {
      0%, 100% { transform: translateY(0px) scale(1); }
      50% { transform: translateY(-3px) scale(1.03); }
    }
    @keyframes shimmerRibbon {
      0% { stop-color: #ffffff; }
      50% { stop-color: #e2e4e8; }
      100% { stop-color: #ffffff; }
    }
    #core-glow-layer {
      transform-origin: 256px 256px;
      animation: pulseGlow 3.2s ease-in-out infinite;
    }
    #core-group {
      transform-origin: 256px 256px;
      animation: coreFloat 3.2s ease-in-out infinite;
    }
    """

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bg-grad" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#181a1f"/>
      <stop offset="60%" stop-color="#0e0f12"/>
      <stop offset="100%" stop-color="#08080a"/>
    </radialGradient>

    <!-- Core Ambient Glow -->
    <radialGradient id="glow-grad-{color_name}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{theme['core_center']}" stop-opacity="0.85"/>
      <stop offset="45%" stop-color="{theme['core_base']}" stop-opacity="0.45"/>
      <stop offset="75%" stop-color="{theme['core_base']}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="{theme['core_base']}" stop-opacity="0.0"/>
    </radialGradient>

    <!-- 3D Core Sphere Shading -->
    <radialGradient id="sphere-grad-{color_name}" cx="38%" cy="32%" r="65%">
      <stop offset="0%" stop-color="{theme['accent']}"/>
      <stop offset="25%" stop-color="{theme['core_center']}"/>
      <stop offset="65%" stop-color="{theme['core_base']}"/>
      <stop offset="92%" stop-color="{theme['core_shadow']}"/>
      <stop offset="100%" stop-color="#0a0002"/>
    </radialGradient>

    <!-- Core Specular Highlight -->
    <radialGradient id="highlight-grad" cx="35%" cy="35%" r="40%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="40%" stop-color="#ffffff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
    </radialGradient>

    <!-- Ribbon Shading Gradients -->
    <linearGradient id="ribbon-grad-top" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#edeef0"/>
      <stop offset="80%" stop-color="#a6aab2"/>
      <stop offset="100%" stop-color="#676b74"/>
    </linearGradient>

    <linearGradient id="ribbon-grad-bot" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#d4d7dc"/>
      <stop offset="85%" stop-color="#8c9099"/>
      <stop offset="100%" stop-color="#4e525a"/>
    </linearGradient>

    <linearGradient id="ribbon-bevel" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="#b8bcc4" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#2a2d34" stop-opacity="0.7"/>
    </linearGradient>

    <filter id="soft-blur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>

    <filter id="core-glow-filter" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <style>
    .ribbon {{ fill-rule: evenodd; }}
    {anim_css}
  </style>

  <!-- Layer 1: Background Squircle Plate (Toggleable) -->
  <g id="layer-background">
    <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#bg-grad)" stroke="#22252a" stroke-width="2"/>
    <!-- Subtle inner rim light on container -->
    <rect x="25" y="25" width="462" height="462" rx="103" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
  </g>

  <!-- Layer 2: Ribbon Back Loop (passes behind the core) -->
  <g id="layer-ribbon-back" transform="rotate(-42 256 256)">
    <!-- Back connecting bend -->
    <path class="ribbon" d="M 170,256 C 170,185 205,130 256,130 C 307,130 342,185 342,256 C 342,295 328,328 304,352 L 274,324 C 290,306 298,284 298,256 C 298,205 278,168 256,168 C 234,168 214,205 214,256 C 214,284 222,306 238,324 L 208,352 C 184,328 170,295 170,256 Z" fill="url(#ribbon-grad-bot)" opacity="0.95"/>
  </g>

  <!-- Layer 3: Central Glowing Core (Target for Lottie scale/pulse/glow animations) -->
  <g id="layer-core">
    <!-- 3a: Ambient Bloom Glow -->
    <g id="core-glow-layer">
      <circle cx="256" cy="256" r="82" fill="url(#glow-grad-{color_name})" filter="url(#core-glow-filter)"/>
    </g>

    <!-- 3b: Core Sphere Body -->
    <g id="core-group">
      <circle id="core-sphere" cx="256" cy="256" r="44" fill="url(#sphere-grad-{color_name})"/>
      
      <!-- 3c: Specular Highlight -->
      <ellipse id="core-specular" cx="240" cy="240" rx="16" ry="12" transform="rotate(-25 240 240)" fill="url(#highlight-grad)"/>
      <circle id="core-hotspot" cx="236" cy="235" r="3.5" fill="#ffffff" opacity="0.95"/>
    </g>
  </g>

  <!-- Layer 4: Ribbon Front Loop (passes in front / intertwines) -->
  <g id="layer-ribbon-front" transform="rotate(-42 256 256)">
    <!-- Front loop arches and twists with bevel depth -->
    <!-- Main upper wing -->
    <path class="ribbon" d="M 256,88 C 345,88 412,165 412,256 C 412,310 388,358 348,392 L 314,356 C 344,330 364,295 364,256 C 364,188 316,134 256,134 C 196,134 148,188 148,256 C 148,295 168,330 198,356 L 164,392 C 124,358 100,310 100,256 C 100,165 167,88 256,88 Z" fill="url(#ribbon-grad-top)"/>

    <!-- Dynamic twisting inner strand -->
    <path d="M 256,88 C 300,88 340,112 368,148 L 332,180 C 312,154 285,134 256,134 Z" fill="url(#ribbon-bevel)"/>
    <path d="M 100,256 C 100,200 126,150 168,118 L 198,154 C 168,178 148,214 148,256 Z" fill="url(#ribbon-bevel)"/>
  </g>
</svg>"""
    return svg

def main():
    # Generate static SVGs for all color themes
    for name in THEMES:
        svg_content = generate_svg(name, is_animated=False)
        path = os.path.join(OUT_DIR, f"tandem-icon-{name}.svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg_content)
        print(f"Generated {path}")

    # Generate primary generic SVG (default orange)
    with open(os.path.join(OUT_DIR, "tandem-icon.svg"), "w", encoding="utf-8") as f:
        f.write(generate_svg("orange", is_animated=False))
        
    # Generate standalone Animated SVG
    with open(os.path.join(OUT_DIR, "tandem-icon-animated.svg"), "w", encoding="utf-8") as f:
        f.write(generate_svg("orange", is_animated=True))
    print("Generated tandem-icon-animated.svg")

if __name__ == "__main__":
    main()
