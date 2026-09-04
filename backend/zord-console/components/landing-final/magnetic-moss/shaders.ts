/** Full-screen quad - moss reveal with magnetic cursor falloff + organic noise. */
export const VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

export const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_dry;
  uniform sampler2D u_moss;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_radius;
  uniform float u_influence;
  uniform float u_time;
  uniform float u_distort;
  uniform float u_idleBreath;
  uniform float u_texAspect;
  uniform vec2 u_mossUvScale;
  uniform vec2 u_mossUvOffset;
  uniform float u_anchorBottom;

  varying vec2 v_uv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  vec3 enhanceMoss(vec3 rgb, float t) {
    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
    vec3 sat = mix(vec3(luma), rgb, 1.0 + t * 0.10);
    sat *= 1.0 + t * 0.08;
    sat.g += t * 0.12;
    sat.r -= t * 0.02;
    return clamp(sat, 0.0, 1.0);
  }

  vec2 fitTextureUv(vec2 uv, float canvasAspect, float texAspect) {
    vec2 fitUv = uv;
    if (canvasAspect > texAspect) {
      float scale = texAspect / canvasAspect;
      fitUv.x = (uv.x - 0.5) / scale + 0.5;
    } else {
      float scale = canvasAspect / texAspect;
      float band = 1.0 - scale;
      float yOrigin = u_anchorBottom > 0.5 ? band : band * 0.5;
      fitUv.y = (uv.y - yOrigin) / scale;
    }
    return fitUv;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = vec2(frag.x / u_resolution.x, 1.0 - frag.y / u_resolution.y);
    float canvasAspect = u_resolution.x / u_resolution.y;
    vec2 fitUv = fitTextureUv(uv, canvasAspect, u_texAspect);

    if (fitUv.x < 0.0 || fitUv.x > 1.0 || fitUv.y < 0.0 || fitUv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float breathe = sin(u_time * 0.9 + fitUv.x * 6.0) * 0.0008 * u_idleBreath;
    float nLive = (fbm(fitUv * 9.0 + u_time * 0.2) - 0.5) * 0.0012 * u_idleBreath;
    vec2 uvDry = fitUv + vec2(breathe, nLive);

    vec2 toCursor = u_mouse - frag;
    float dist = length(toCursor);

    float inner = u_radius * 0.18;
    float outer = u_radius;
    float magnetic = 1.0 - smoothstep(inner, outer, dist);
    magnetic = pow(magnetic, 1.35);

    float edgeNoise = fbm(fitUv * 14.0 + u_time * 0.2) * 2.0 - 1.0;
    magnetic += edgeNoise * 0.08 * u_influence;
    magnetic = clamp(magnetic, 0.0, 1.0) * u_influence;

    vec2 dir = dist > 0.5 ? normalize(toCursor) : vec2(0.0);
    float pull = magnetic * u_distort / u_resolution.y;
    vec2 uvMoss = (uvDry - 0.5) * u_mossUvScale + 0.5 + u_mossUvOffset;
    uvMoss += dir * pull * (1.0 - dist / outer);

    vec4 dry = texture2D(u_dry, uvDry);
    vec4 moss = texture2D(u_moss, uvMoss);

    float enhance = magnetic * moss.a;
    vec3 mossRgb = enhanceMoss(moss.rgb, enhance);

    vec3 dryRgb = dry.rgb * (1.0 - enhance * 0.10);
    dryRgb *= 1.0 - enhance * 0.04;

    float reveal = magnetic * moss.a;
    vec3 color = mix(dryRgb, mossRgb, reveal);

    color = (color - 0.5) * (1.0 + enhance * 0.06) + 0.5;
    color = clamp(color, 0.0, 1.0);

    float alpha = max(dry.a, reveal * moss.a);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`
