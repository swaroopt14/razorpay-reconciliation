import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

export type MossMode = 'desktop' | 'tablet' | 'mobile' | 'reduced'

export type MagneticMossConfig = {
  drySrc: string
  mossSrc: string
  radiusDesktop?: number
  radiusTablet?: number
  distortPx?: number
  anchorBottom?: boolean
}

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

export type MagneticMossEngine = {
  destroy: () => void
  resize: (width: number, height: number, dpr: number) => void
  setMode: (mode: MossMode) => void
  setInteractionEnabled: (enabled: boolean) => void
  setPointer: (x: number, y: number, active: boolean) => void
  tick: (dt: number) => void
  draw: () => void
  drawParticles: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
  ready: boolean
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(log ?? 'Shader compile failed')
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed')
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return program
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    const slash = src.lastIndexOf('/')
    const encoded = slash >= 0 ? `${src.slice(0, slash + 1)}${encodeURIComponent(src.slice(slash + 1))}` : encodeURIComponent(src)
    img.src = encoded
  })
}

function uploadTexture(gl: WebGLRenderingContext, image: TexImageSource, unit: number) {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  return tex
}

export async function createMagneticMossEngine(
  canvas: HTMLCanvasElement,
  config: MagneticMossConfig,
): Promise<MagneticMossEngine> {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
  })
  if (!gl) throw new Error('WebGL not available')

  const program = createProgram(gl)
  gl.useProgram(program)

  const posLoc = gl.getAttribLocation(program, 'a_position')
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

  const [dryImg, mossImg] = await Promise.all([loadImage(config.drySrc), loadImage(config.mossSrc)])
  const dryTex = uploadTexture(gl, dryImg, 0)
  const mossTex = uploadTexture(gl, mossImg, 1)

  const uniforms = {
    dry: gl.getUniformLocation(program, 'u_dry'),
    moss: gl.getUniformLocation(program, 'u_moss'),
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    radius: gl.getUniformLocation(program, 'u_radius'),
    influence: gl.getUniformLocation(program, 'u_influence'),
    time: gl.getUniformLocation(program, 'u_time'),
    distort: gl.getUniformLocation(program, 'u_distort'),
    idleBreath: gl.getUniformLocation(program, 'u_idleBreath'),
    texAspect: gl.getUniformLocation(program, 'u_texAspect'),
    mossUvScale: gl.getUniformLocation(program, 'u_mossUvScale'),
    mossUvOffset: gl.getUniformLocation(program, 'u_mossUvOffset'),
    anchorBottom: gl.getUniformLocation(program, 'u_anchorBottom'),
  }

  const texAspect = dryImg.naturalWidth / dryImg.naturalHeight
  const mossScaleX = dryImg.naturalWidth / mossImg.naturalWidth
  const mossScaleY = dryImg.naturalHeight / mossImg.naturalHeight
  const radiusDesktop = config.radiusDesktop ?? 150
  const radiusTablet = config.radiusTablet ?? 110
  const distortPx = config.distortPx ?? 8
  const anchorBottom = config.anchorBottom ? 1 : 0

  gl.uniform1i(uniforms.dry, 0)
  gl.uniform1i(uniforms.moss, 1)
  gl.uniform1f(uniforms.anchorBottom, anchorBottom)

  let mode: MossMode = 'desktop'
  let interactionEnabled = true
  let pointerActive = false
  let targetX = 0
  let targetY = 0
  let smoothX = 0
  let smoothY = 0
  let influence = 0
  let influenceVel = 0
  let time = 0
  let width = 1
  let height = 1
  const particles: Particle[] = []

  const springStiffness = 72
  const springDamping = 14
  const springMass = 1

  function radiusForMode() {
    if (mode === 'tablet') return radiusTablet
    if (mode === 'mobile' || mode === 'reduced') return 0
    return radiusDesktop
  }

  function spawnParticle(x: number, y: number) {
    if (particles.length >= 20) particles.shift()
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.3 - Math.random() * 0.6,
      life: 0,
      maxLife: 0.8 + Math.random() * 0.6,
    })
  }

  return {
    ready: true,
    resize(w: number, h: number, dpr: number) {
      width = Math.max(1, Math.floor(w * dpr))
      height = Math.max(1, Math.floor(h * dpr))
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    },
    setMode(m) {
      mode = m
    },
    setInteractionEnabled(enabled) {
      interactionEnabled = enabled
      if (!enabled) {
        pointerActive = false
      }
    },
    setPointer(x, y, active) {
      const interactive = mode === 'desktop' || mode === 'tablet'
      pointerActive = active && interactive && interactionEnabled
      targetX = x
      targetY = height - y
      if (active && interactive && interactionEnabled && Math.random() < 0.12) {
        spawnParticle(x, height - y)
      }
    },
    tick(dt) {
      const capped = Math.min(dt, 0.05)
      time += capped

      const interactive = mode === 'desktop' || mode === 'tablet'
      const lerp = interactive && pointerActive ? 0.055 : 0.04
      smoothX += (targetX - smoothX) * lerp
      smoothY += (targetY - smoothY) * lerp

      const targetInfluence =
        !interactionEnabled
          ? 0
          : mode === 'mobile' || mode === 'reduced'
            ? 0.12 + 0.06 * Math.sin(time * 0.5)
            : pointerActive
              ? 1
              : 0

      const force = -springStiffness * (influence - targetInfluence)
      const damp = -springDamping * influenceVel
      const accel = (force + damp) / springMass
      influenceVel += accel * capped
      influence += influenceVel * capped
      influence = Math.max(0, Math.min(1, influence))

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!
        p.life += capped
        p.x += p.vx
        p.y += p.vy
        if (p.life >= p.maxLife) particles.splice(i, 1)
      }
    },
    draw() {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      const dpr = height / (canvas.clientHeight || 1)
      const radius = radiusForMode() * dpr
      const distort = distortPx * dpr

      gl.uniform2f(uniforms.resolution, width, height)
      gl.uniform2f(uniforms.mouse, smoothX, smoothY)
      gl.uniform1f(uniforms.radius, radius)
      gl.uniform1f(uniforms.influence, influence)
      gl.uniform1f(uniforms.time, time)
      gl.uniform1f(uniforms.distort, distort)
      gl.uniform1f(
        uniforms.idleBreath,
        mode === 'mobile' || mode === 'reduced' ? 1.4 : pointerActive ? 1 : 0.35,
      )
      gl.uniform1f(uniforms.texAspect, texAspect)
      gl.uniform2f(uniforms.mossUvScale, mossScaleX, mossScaleY)
      gl.uniform2f(uniforms.mossUvOffset, 0, 0)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    drawParticles(ctx, w, h) {
      ctx.clearRect(0, 0, w, h)
      const scaleX = w / width
      const scaleY = h / height
      for (const p of particles) {
        const t = p.life / p.maxLife
        const alpha = (1 - t) * 0.35
        const px = p.x * scaleX
        const py = (height - p.y) * scaleY
        ctx.beginPath()
        ctx.fillStyle = `rgba(72, 120, 48, ${alpha})`
        ctx.arc(px, py, 1.2 + (1 - t) * 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    destroy() {
      gl.deleteTexture(dryTex)
      gl.deleteTexture(mossTex)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}
