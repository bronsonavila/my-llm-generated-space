interface Asteroid {
  x: number
  y: number
  r: number
  a: number
  s: number
  vx: number
  vy: number
  merged: boolean
  hue: number
}

interface Flare {
  x: number
  y: number
  radius: number
  hue: number
  alpha: number
}

interface Trail {
  x: number
  y: number
  r: number
  hue: number
  alpha: number
  ripple: boolean
}

interface Star {
  x: number
  y: number
  phase: number
  brightness: number
  trail?: number // Make trail optional for compatibility with existing code
  distanceFactor?: number
}

interface ShootingStar {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  speed: number
  trail: number
  alpha: number
  active: boolean
}

interface Mouse {
  x: number | null
  y: number | null
}

interface Spaceship {
  x: number
  y: number
  angle: number
  targetAngle: number
  speed: number
  size: number
  thrusterAlpha: number
  active: boolean
  respawnTime: number
  entryEdge: number // 0=top, 1=right, 2=bottom, 3=left
  lastExitEdge: number // The edge where the ship last exited
  hasBeenActive: boolean
  targetExitEdge: number // The currently targeted exit edge
  inDangerZone: boolean // Whether the ship is currently in the danger zone
  exploding: boolean // Whether the ship is currently exploding
  explosionTime: number // When the explosion started
  explosionParticles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number; hue: number }[] // Particles for explosion effect
}

;(() => {
  let animationFrameRef: number | undefined
  const mouseRef: Mouse = { x: null, y: null }
  const lastTapTimeRef = { time: 0 }

  const canvas = document.querySelector('canvas')
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Set canvas size
  const resizeCanvas = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resizeCanvas()

  const asteroids: Asteroid[] = []
  const flares: Flare[] = []
  const trails: Trail[] = []
  const stars: Star[] = []
  const shootingStars: ShootingStar[] = []
  let asteroidCount = Math.floor((canvas.width * canvas.height) / 8000)
  let holeX = canvas.width / 2
  let holeY = canvas.height / 2
  const blackHoleRadius = 50

  // Add background rotation variable
  let backgroundRotation = 0

  // Generate static nebula effects
  const nebulae: { x: number; y: number; size: number; baseHue: number; distanceFactor?: number }[] = []
  const nebulaCount = 6

  for (let i = 0; i < nebulaCount; i++) {
    // Create random positions - keep away from the very center
    const angle = Math.random() * Math.PI * 2
    const distance = canvas.width * 0.2 + Math.random() * (canvas.width * 0.4)
    const x = holeX + Math.cos(angle) * distance
    const y = holeY + Math.sin(angle) * distance

    // Random size for the nebula
    const size = canvas.width * (0.15 + Math.random() * 0.25)

    // Calculate a distance factor for parallax effect (0.5 to 1.0)
    // Closer to the center rotates faster
    const distanceFactor = 0.5 + 0.5 * (distance / (canvas.width * 0.6))

    // Random hue in blue/purple range with occasional red/green hints
    const baseHue =
      Math.random() < 0.7
        ? 220 + Math.random() * 60 // blues and purples
        : Math.random() * 60 // occasional reds/oranges/yellows

    nebulae.push({ x, y, size, baseHue, distanceFactor })
  }

  // Initialize background stars - same count as asteroids
  for (let i = 0; i < asteroidCount; i++) {
    const distance = Math.random() * canvas.width * 0.7 // Random distance from center
    const angle = Math.random() * Math.PI * 2
    const x = holeX + Math.cos(angle) * distance
    const y = holeY + Math.sin(angle) * distance

    // Distance factor for stars (0.6 to 1.2) - closer stars rotate faster
    const distanceFactor = 0.6 + 0.6 * (distance / (canvas.width * 0.7))

    stars.push({
      x,
      y,
      phase: Math.random() * Math.PI * 2,
      brightness: 0.3 + Math.random() * 0.4,
      trail: 6 + Math.random() * 8,
      distanceFactor
    })
  }

  // Create spaceship with initial inactive state
  const ship: Spaceship = {
    x: 0,
    y: 0,
    angle: 0,
    targetAngle: 0,
    speed: 0.7,
    size: 8,
    thrusterAlpha: 0,
    active: false,
    respawnTime: Date.now() + 5000 + Math.random() * 5000, // Increased initial spawn time
    entryEdge: 0,
    lastExitEdge: Math.floor(Math.random() * 4), // Initialize with a random edge
    hasBeenActive: false,
    targetExitEdge: 0, // Will be set during spawn
    inDangerZone: false,
    exploding: false,
    explosionTime: 0,
    explosionParticles: []
  }

  // Waypoints for the ship to navigate through
  const waypoints: { x: number; y: number }[] = []

  // Create initial waypoints in a pattern that avoids the center
  function generateWaypoints() {
    waypoints.length = 0
    const safeRadius = Math.min(canvas!.width, canvas!.height) * 0.32
    const centerX = canvas!.width / 2
    const centerY = canvas!.height / 2

    // Create a path that circles around the black hole
    const numPoints = 16
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2
      // Add slight variance to the orbit radius for a more natural path
      const distance = safeRadius * (0.95 + Math.random() * 0.15)
      waypoints.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance
      })
    }
  }

  generateWaypoints()

  function getHueFromSize(r: number) {
    const minR = 1
    const maxR = 100
    const clamped = Math.min(maxR, Math.max(minR, r))
    const t = (clamped - minR) / (maxR - minR)
    return 220 - t * 220 + Math.random() * 40 - 20
  }

  function spawnAsteroidInside() {
    const r = 1 + Math.random() * 2

    // Ensure asteroids don't spawn too close to the black hole
    // Use a balanced minimum distance that keeps asteroids at a good viewing distance
    const minSafeDistance = blackHoleRadius * 3.5
    let x, y, distToHole

    // Keep trying until we find a safe position
    do {
      x = Math.random() * canvas!.width
      y = Math.random() * canvas!.height

      const dx = x - holeX
      const dy = y - holeY
      distToHole = Math.sqrt(dx * dx + dy * dy)
    } while (distToHole < minSafeDistance)

    asteroids.push({
      x,
      y,
      r,
      a: Math.random() * Math.PI * 2,
      s: 0.05 + Math.random() * 0.08,
      vx: 0,
      vy: 0,
      merged: false,
      hue: getHueFromSize(r)
    })
  }

  function spawnAsteroidFromEdge() {
    if (asteroids.length >= asteroidCount) return

    const edge = Math.floor(Math.random() * 4)
    const margin = 40
    let x, y

    if (edge === 0) {
      x = Math.random() * canvas!.width
      y = -margin
    } else if (edge === 1) {
      x = Math.random() * canvas!.width
      y = canvas!.height + margin
    } else if (edge === 2) {
      x = -margin
      y = Math.random() * canvas!.height
    } else {
      x = canvas!.width + margin
      y = Math.random() * canvas!.height
    }

    const angle = Math.atan2(holeY - y, holeX - x)
    // Even slower initial speed for spawning asteroids
    const speed = (0.015 + Math.random() * 0.03) * 0.4
    const r = 1 + Math.random() * 2

    asteroids.push({
      x,
      y,
      r,
      a: Math.random() * Math.PI * 2,
      s: speed,
      vx: Math.cos(angle) * speed * 2,
      vy: Math.sin(angle) * speed * 2,
      merged: false,
      hue: getHueFromSize(r)
    })

    // 4% chance to spawn a shooting star when an asteroid spawns
    if (Math.random() < 0.04) {
      spawnShootingStar()
    }
  }

  while (asteroids.length < asteroidCount) {
    spawnAsteroidInside()
  }

  // Function to spawn a shooting star from edge of screen
  function spawnShootingStar() {
    // Choose a random edge (0=top, 1=right, 2=bottom, 3=left)
    const edge = Math.floor(Math.random() * 4)
    const margin = 20
    let x, y

    if (edge === 0) {
      x = Math.random() * canvas!.width
      y = -margin
    } else if (edge === 1) {
      x = canvas!.width + margin
      y = Math.random() * canvas!.height
    } else if (edge === 2) {
      x = Math.random() * canvas!.width
      y = canvas!.height + margin
    } else {
      x = -margin
      y = Math.random() * canvas!.height
    }

    // Calculate random destination point anywhere on canvas
    // Avoid pointing directly at black hole by adding random offset
    const destX = Math.random() * canvas!.width
    const destY = Math.random() * canvas!.height

    // Calculate angle and speed toward destination
    const angle = Math.atan2(destY - y, destX - x)
    const speed = 2 + Math.random() * 4

    shootingStars.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1 + Math.random() * 1.5,
      speed,
      trail: 6 + Math.random() * 8,
      alpha: 0.7 + Math.random() * 0.3,
      active: true
    })
  }

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Create a subtle radial gradient for the background
    const bgGradient = ctx.createRadialGradient(holeX, holeY, 0, holeX, holeY, Math.max(canvas.width, canvas.height))
    bgGradient.addColorStop(0, 'rgb(22,12,38)')
    bgGradient.addColorStop(0.25, 'rgb(14,7,25)')
    bgGradient.addColorStop(0.5, 'rgb(10,6,18)')
    bgGradient.addColorStop(0.75, 'rgb(6,4,12)')
    bgGradient.addColorStop(0.9, 'rgb(3,3,6)')
    bgGradient.addColorStop(1, 'rgb(1,1,3)')

    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw static nebula-like effects
    for (const nebula of nebulae) {
      // Save current context state before rotation
      ctx.save()

      // Translate to hole center (rotation pivot)
      ctx.translate(holeX, holeY)

      // Apply rotation around black hole - use distance factor for differential rotation
      // Nebulae farther from center rotate slower (higher distance factor means slower rotation)
      const nebulaeRotation = backgroundRotation / (nebula.distanceFactor || 1.0)
      ctx.rotate(nebulaeRotation)

      // Translate back to origin
      ctx.translate(-holeX, -holeY)

      // Create radial gradient for nebula
      const nebulaGradient = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.size)

      // Very low opacity
      nebulaGradient.addColorStop(0, `hsla(${nebula.baseHue}, 70%, 40%, 0.06)`)
      nebulaGradient.addColorStop(0.5, `hsla(${nebula.baseHue + 20}, 80%, 30%, 0.04)`)
      nebulaGradient.addColorStop(1, `hsla(${nebula.baseHue + 40}, 60%, 20%, 0)`)

      ctx.fillStyle = nebulaGradient
      ctx.beginPath()
      ctx.arc(nebula.x, nebula.y, nebula.size, 0, Math.PI * 2)
      ctx.fill()

      // Restore context to pre-rotation state
      ctx.restore()
    }

    // Increment background rotation (extremely slow counter-clockwise rotation)
    backgroundRotation -= 0.00003

    // Draw black hole with concentric circles
    // Start with outer glow effect (draw from outside in)
    for (let i = 30; i >= 1; i--) {
      const ratio = i / 30
      ctx.beginPath()
      ctx.arc(holeX, holeY, blackHoleRadius * (0.9 + ratio * 0.9), 0, Math.PI * 2)
      // Non-linear fade: quick initial fade, then gradual slope to darkness
      const fadeAlpha = 0.4 * Math.pow(1 - ratio, 5)
      ctx.fillStyle = `rgba(170, 170, 170, ${fadeAlpha})`
      ctx.fill()
    }

    // Draw bright ring (accretion disk)
    ctx.beginPath()
    ctx.arc(holeX, holeY, blackHoleRadius * 0.9, 0, Math.PI * 2)
    ctx.fillStyle = '#aaaaaa'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(holeX, holeY, blackHoleRadius * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = '#555555'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(holeX, holeY, blackHoleRadius * 0.75, 0, Math.PI * 2)
    ctx.fillStyle = '#222222'
    ctx.fill()

    // Draw solid black center last to ensure it's on top
    ctx.beginPath()
    ctx.arc(holeX, holeY, blackHoleRadius * 0.725, 0, Math.PI * 2)
    ctx.fillStyle = '#000000'
    ctx.fill()

    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i]
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${f.hue}, 100%, 70%, ${f.alpha})`
      ctx.fill()
      f.radius += 0.1
      f.hue += 0.5
      f.alpha -= 0.008
      if (f.alpha <= 0) flares.splice(i, 1)
    }

    for (let i = trails.length - 1; i >= 0; i--) {
      const t = trails[i]
      ctx.beginPath()
      ctx.lineWidth = t.ripple ? 2 : 0
      ctx.strokeStyle = t.ripple ? `rgba(255, 255, 255, ${t.alpha})` : `hsla(${t.hue}, 100%, 75%, ${t.alpha})`
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2)
      if (t.ripple) {
        ctx.stroke()
      } else {
        ctx.fillStyle = `hsla(${t.hue}, 100%, 75%, ${t.alpha})`
        ctx.fill()
      }
      if (t.ripple) t.r += 3
      else t.r *= 0.97
      t.alpha -= t.ripple ? 0.015 : 0.02
      if (t.alpha <= 0.001) trails.splice(i, 1)
    }

    ctx.shadowBlur = 0

    for (let i = 0; i < asteroids.length; i++) {
      const a1 = asteroids[i]
      if (a1.merged) continue
      for (let j = i + 1; j < asteroids.length; j++) {
        const a2 = asteroids[j]
        if (a2.merged) continue
        const dx = a2.x - a1.x
        const dy = a2.y - a1.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < a1.r + a2.r) {
          let larger = a1
          let smaller = a2
          if (a2.r > a1.r) {
            larger = a2
            smaller = a1
          }
          const area1 = Math.PI * larger.r * larger.r
          const area2 = Math.PI * smaller.r * smaller.r
          const growthModifier = 1 / (1 + larger.r * 0.15)
          const newArea = area1 + area2 * growthModifier
          larger.r = Math.sqrt(newArea / Math.PI)
          const targetHue = getHueFromSize(larger.r)
          const blendFactor = 0.3 + 0.2 * Math.sin(larger.r + Date.now() * 0.001)
          larger.hue = larger.hue * (1 - blendFactor) + targetHue * blendFactor
          smaller.merged = true

          const recoilAngle = Math.atan2(smaller.y - larger.y, smaller.x - larger.x)
          const recoilStrength = 0.5 / larger.r
          larger.vx -= Math.cos(recoilAngle) * recoilStrength
          larger.vy -= Math.sin(recoilAngle) * recoilStrength

          trails.push({ x: larger.x, y: larger.y, r: larger.r * 0.8, hue: larger.hue, alpha: 0.2, ripple: false })

          // Add burst effect at collision point
          const collisionX = smaller.x + (larger.x - smaller.x) * 0.5
          const collisionY = smaller.y + (larger.y - smaller.y) * 0.5
          const burstSize = Math.min(smaller.r * 0.5, larger.r * 0.3)

          // Add a few burst particles
          for (let b = 0; b < 4; b++) {
            const angle = Math.random() * Math.PI * 2
            const distance = burstSize * Math.random() * 0.8
            trails.push({
              x: collisionX + Math.cos(angle) * distance,
              y: collisionY + Math.sin(angle) * distance,
              r: burstSize * (0.5 + Math.random() * 0.5),
              hue: smaller.hue,
              alpha: 0.5 + Math.random() * 0.3,
              ripple: false
            })
          }
        }
      }
    }

    for (let i = asteroids.length - 1; i >= 0; i--) {
      if (asteroids[i].merged) asteroids.splice(i, 1)
    }

    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i]
      const sizeFactor = 1 / Math.pow(a.r, 0.5)

      const dx = holeX - a.x
      const dy = holeY - a.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Calculate normalized distance for scaling effects
      // Use a larger scaling factor to make the transition more gradual
      const maxDist = canvas.width * 0.9
      const t = Math.min(1, Math.max(0, 1 - dist / maxDist))

      // Create a more dramatic acceleration curve based on distance
      let eased
      if (dist < blackHoleRadius * 4) {
        // Close to black hole - strong acceleration curve (similar to asteroids)
        if (dist > blackHoleRadius * 2) {
          // Moderate zone: begin ramping up acceleration - increased
          eased = 0.6 + Math.pow(1 - dist / (blackHoleRadius * 4), 2) * 3.5
        } else if (dist > blackHoleRadius * 1.8 && dist <= blackHoleRadius * 2) {
          // Strong suck-in effect at the outer edge of concentric circles
          eased = 4.0 + Math.pow(1 - dist / (blackHoleRadius * 2), 2) * 15.0
        } else {
          // Inner zone: dramatic acceleration - greatly increased for more visible pull
          eased = 2.0 + Math.pow(1 - dist / (blackHoleRadius * 2), 2) * 12.0
        }
      } else {
        // Far away - moderate movement to exert more pull at range
        eased = Math.pow(t, 4) * 0.25
      }

      // Apply acceleration with modified curve - reduce overall acceleration
      const accel = 0.000003 + 0.000075 * eased

      a.vx += dx * accel * sizeFactor
      a.vy += dy * accel * sizeFactor

      // Scale spiral and curve effects more dramatically with distance
      const distanceFactor =
        dist < blackHoleRadius * 2
          ? 1.0 // Full strength near black hole
          : dist < blackHoleRadius * 4
          ? 0.3 + 0.5 * (1 - (dist - blackHoleRadius * 2) / (blackHoleRadius * 2)) // Reduced middle range effects
          : 0.12 + 0.18 * t // Even slower at far distances

      // Reduce the spiral effect in the middle range to prevent orbiting
      const spiralStrength =
        dist < blackHoleRadius * 4 && dist > blackHoleRadius * 2
          ? 0.003 * (1 - (dist - blackHoleRadius * 2) / (blackHoleRadius * 2))
          : 0.005

      const spiral =
        spiralStrength * sizeFactor * distanceFactor + 0.0008 * Math.sin(Date.now() * 0.002) * distanceFactor
      const angle = Math.atan2(dy, dx)

      // Reduce curve effect in middle range to prevent orbital trapping
      const curveStrength =
        dist < blackHoleRadius * 4 && dist > blackHoleRadius * 2
          ? 0.0025 * (1 - (dist - blackHoleRadius * 2) / (blackHoleRadius * 2))
          : 0.0035

      const curve =
        curveStrength * (1 - t) * distanceFactor + 0.0008 * Math.cos(Date.now() * 0.002 + a.a) * distanceFactor
      a.vx += Math.cos(angle + Math.PI / 2) * curve
      a.vy += Math.sin(angle + Math.PI / 2) * curve
      a.vx += Math.cos(angle + Math.PI / 2) * spiral
      a.vy += Math.sin(angle + Math.PI / 2) * spiral

      a.a += 0.0004 * sizeFactor * distanceFactor

      if (mouseRef.x !== null && mouseRef.y !== null) {
        const dx = mouseRef.x - a.x
        const dy = mouseRef.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Keep reduced radius but increase influence
        const influenceRadius = 220
        if (dist < influenceRadius) {
          const angle = Math.atan2(dy, dx)
          // Moderate influence with balanced falloff
          const strength = Math.pow(1 - dist / influenceRadius, 1.8) * 0.85
          const tangential = angle + Math.PI / 2

          // Reduce orbital effects by 20%
          a.vx += Math.cos(tangential) * strength * 0.0252 * sizeFactor
          a.vy += Math.sin(tangential) * strength * 0.0252 * sizeFactor
          a.vx += dx * strength * 0.0013 * sizeFactor
          a.vy += dy * strength * 0.0013 * sizeFactor

          // Add a slight velocity dampening when near cursor
          a.vx *= 0.988
          a.vy *= 0.988
        }
      }

      a.x += a.vx
      a.y += a.vy

      // Check if asteroid is outside canvas boundaries and remove it
      const margin = 50 // Allow a small margin outside the canvas before removing
      if (a.x < -margin || a.x > canvas.width + margin || a.y < -margin || a.y > canvas.height + margin) {
        asteroids.splice(i, 1)
        continue
      }

      // Apply distance-based velocity scaling with slightly more dampening across all ranges
      const velocityRetention =
        dist < blackHoleRadius * 2
          ? 0.992 // Slightly more dampening near black hole
          : dist < blackHoleRadius * 4
          ? 0.984 // More dampening in middle range
          : 0.97 + 0.01 * t // Even stronger dampening far from black hole

      a.vx *= velocityRetention
      a.vy *= velocityRetention

      // Basic trail for all asteroids
      trails.push({ x: a.x, y: a.y, r: a.r * 1.2, hue: a.hue, alpha: 0.12, ripple: false })

      const distToHole = Math.sqrt((a.x - holeX) ** 2 + (a.y - holeY) ** 2)

      // Enhanced trails for asteroids approaching the event horizon
      if (distToHole < blackHoleRadius * 1.5 && distToHole > blackHoleRadius * 0.65) {
        // Calculate how close to the event horizon we are (1.0 = at the edge of enhanced zone, 0.0 = at the event horizon)
        const proximityFactor = (distToHole - blackHoleRadius * 0.65) / (blackHoleRadius * 0.85)

        // More dramatic trails as we approach the event horizon
        const trailCount = Math.floor(7 * (1 - proximityFactor) + 3)
        const trailAlpha = 0.4 * (1 - proximityFactor) + 0.15

        // Special strong effect at the outer edge (1.8-2.0 times radius)
        if (distToHole > blackHoleRadius * 1.8 && distToHole < blackHoleRadius * 2.0) {
          // Extra dramatic trails at the suck-in zone
          const extraTrailCount = 12
          const trailLength = 5

          for (let t = 0; t < extraTrailCount; t++) {
            const offset = (t + 1) * trailLength
            trails.push({
              x: a.x - a.vx * offset * 1.2,
              y: a.y - a.vy * offset * 1.2,
              r: a.r * (1.5 - t * 0.1),
              hue: a.hue,
              alpha: 0.5 * (1 - t / extraTrailCount),
              ripple: false
            })
          }

          // Add circular ripple effect for dramatic visual
          trails.push({
            x: a.x,
            y: a.y,
            r: a.r * 1.5,
            hue: a.hue,
            alpha: 0.2,
            ripple: true
          })
        }

        // Create a trail of particles behind the asteroid
        for (let t = 0; t < trailCount; t++) {
          const offset = (t + 1) * 2.5
          trails.push({
            x: a.x - a.vx * offset * 0.8,
            y: a.y - a.vy * offset * 0.8,
            r: a.r * (1.2 - t * 0.15),
            hue: a.hue,
            alpha: trailAlpha * (1 - t / trailCount),
            ripple: false
          })
        }
      }

      // Final consumption phase - expanded central zone even further
      if (distToHole < blackHoleRadius * 0.65) {
        // Stronger pull toward center
        a.vx += dx * 0.07
        a.vy += dy * 0.07

        // Just leave trailing effect while scaling down
        trails.push({ x: a.x, y: a.y, r: a.r * 1.4, hue: a.hue, alpha: 0.15, ripple: false })

        // Faster shrinking
        a.r *= 0.7
        a.vx *= 0.65
        a.vy *= 0.65

        const centerThreshold = 16
        const closeToCenter = Math.abs(a.x - holeX) < centerThreshold && Math.abs(a.y - holeY) < centerThreshold

        // Expanded disappearance conditions - without extra trails
        if (a.r < 0.7 || closeToCenter || distToHole < blackHoleRadius * 0.45) {
          asteroids.splice(i, 1)
          continue
        }
      }

      // Immediate removal if asteroid reaches any of the inner rings (dark circle, dark gray, or mid-gray)
      if (distToHole < blackHoleRadius * 0.8) {
        // Simply shrink and remove without burst effects
        a.r *= 0.6

        // Remove when tiny enough
        if (a.r < 0.5) {
          asteroids.splice(i, 1)
        }
        continue
      }

      ctx.beginPath()
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
      ctx.fillStyle = `hsl(${a.hue}, 70%, 70%)`
      ctx.fill()
    }

    while (asteroids.length < asteroidCount) {
      spawnAsteroidFromEdge()
      if (asteroids.length < asteroidCount) {
        spawnAsteroidFromEdge()
      }
    }

    // After drawing everything else, draw stars LAST to ensure they're visible
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i]

      // Save context state
      ctx.save()

      // Apply rotation with distance factor for parallax effect
      // Stars farther from center rotate slower (higher distance factor means slower rotation)
      ctx.translate(holeX, holeY)
      const starRotation = backgroundRotation / (star.distanceFactor || 1.0)
      ctx.rotate(starRotation)
      ctx.translate(-holeX, -holeY)

      // Calculate distance from black hole center
      const distFromCenter = Math.sqrt(Math.pow(star.x - holeX, 2) + Math.pow(star.y - holeY, 2))

      // Skip stars that would appear inside the black hole (including accretion disk)
      if (distFromCenter > blackHoleRadius * 0.9) {
        // Make stars much more visible
        const twinkle = 0.7 + 0.3 * Math.sin(star.phase + Date.now() * 0.0003) * star.brightness
        ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * twinkle})`
        ctx.fillRect(star.x, star.y, 1, 1)
        // Slowly adjust phase
        star.phase += 0.001
      }

      // Restore context
      ctx.restore()
    }

    // Draw and update shooting stars
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const star = shootingStars[i]

      if (!star.active) {
        shootingStars.splice(i, 1)
        continue
      }

      // Apply gravitational forces similar to asteroids but with reduced effect
      const dx = holeX - star.x
      const dy = holeY - star.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Calculate normalized distance for scaling effects
      const maxDist = canvas.width * 0.9
      const t = Math.min(1, Math.max(0, 1 - dist / maxDist))

      // Apply gravity with much stronger effect (50% of asteroid gravity)
      // Dramatically increased to make black hole influence highly noticeable
      const gravityFactor = 0.5

      // Create a more dramatic acceleration curve based on distance - similar to asteroids
      let eased
      if (dist < blackHoleRadius * 4) {
        // Close to black hole - strong acceleration curve (similar to asteroids)
        if (dist > blackHoleRadius * 2) {
          // Moderate zone: begin ramping up acceleration - increased
          eased = 0.6 + Math.pow(1 - dist / (blackHoleRadius * 4), 2) * 3.5
        } else if (dist > blackHoleRadius * 1.8 && dist <= blackHoleRadius * 2) {
          // Strong suck-in effect at the outer edge of concentric circles
          eased = 4.0 + Math.pow(1 - dist / (blackHoleRadius * 2), 2) * 15.0
        } else {
          // Inner zone: dramatic acceleration - greatly increased for more visible pull
          eased = 2.0 + Math.pow(1 - dist / (blackHoleRadius * 2), 2) * 12.0
        }
      } else {
        // Far away - moderate movement to exert more pull at range
        eased = Math.pow(t, 4) * 0.25
      }

      // Apply acceleration with increased factor
      const accel = (0.000003 + 0.000075 * eased) * gravityFactor

      // Add extra boost to gravitational force when close to black hole
      const proximityBoost =
        dist < blackHoleRadius * 3 ? 1.0 + 3.0 * Math.pow(1 - dist / (blackHoleRadius * 3), 2) : 1.0

      // Apply to velocity with proximity boost
      star.vx += dx * accel * star.speed * proximityBoost
      star.vy += dy * accel * star.speed * proximityBoost

      // Scale spiral and curve effects similar to asteroids but enhanced
      const distanceFactor =
        dist < blackHoleRadius * 2
          ? 1.2 // Enhanced strength near black hole
          : dist < blackHoleRadius * 4
          ? 0.4 + 0.6 * (1 - (dist - blackHoleRadius * 2) / (blackHoleRadius * 2))
          : 0.2 + 0.2 * t

      // Add spiral effect similar to asteroids but enhanced
      const spiralStrength = 0.005 * gravityFactor
      const spiral = spiralStrength * distanceFactor + 0.0008 * Math.sin(Date.now() * 0.002) * distanceFactor
      const angle = Math.atan2(dy, dx)

      // Add curve effect similar to asteroids but enhanced
      const curveStrength = 0.004 * gravityFactor
      const curve = curveStrength * (1 - t) * distanceFactor + 0.0008 * Math.cos(Date.now() * 0.002) * distanceFactor

      star.vx += Math.cos(angle + Math.PI / 2) * curve
      star.vy += Math.sin(angle + Math.PI / 2) * curve
      star.vx += Math.cos(angle + Math.PI / 2) * spiral
      star.vy += Math.sin(angle + Math.PI / 2) * spiral

      // Apply very subtle mouse cursor gravity effect
      if (mouseRef.x !== null && mouseRef.y !== null) {
        const mdx = mouseRef.x - star.x
        const mdy = mouseRef.y - star.y
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
        const mouseInfluenceRadius = 200

        if (mdist < mouseInfluenceRadius) {
          const mouseAngle = Math.atan2(mdy, mdx)
          // Very subtle influence with smooth falloff
          const mouseStrength = Math.pow(1 - mdist / mouseInfluenceRadius, 2) * 0.4

          // Apply slight attraction toward mouse
          star.vx += Math.cos(mouseAngle) * mouseStrength * 0.012
          star.vy += Math.sin(mouseAngle) * mouseStrength * 0.012
        }
      }

      // Adjust speed management to allow more dramatic black hole effects
      // Only maintain minimum speed to allow visible orbital paths
      const currentSpeed = Math.sqrt(star.vx * star.vx + star.vy * star.vy)

      // Lower minimum speed threshold but boost higher when triggered
      // to create more dramatic swings in velocity
      if (currentSpeed < star.speed * 0.5) {
        const speedFactor = (star.speed * 0.7) / currentSpeed
        star.vx *= speedFactor
        star.vy *= speedFactor
      }

      // Create a trail effect
      ctx.beginPath()
      ctx.strokeStyle = `rgba(255, 255, 255, ${star.alpha})`
      ctx.lineWidth = star.size
      ctx.moveTo(star.x, star.y)
      ctx.lineTo(star.x - star.vx * star.trail, star.y - star.vy * star.trail)
      ctx.stroke()

      // Draw the star head with a small glow
      ctx.beginPath()
      const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 2)
      gradient.addColorStop(0, `rgba(255, 255, 255, ${star.alpha})`)
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2)
      ctx.fill()

      // Update position
      star.x += star.vx
      star.y += star.vy

      // Check if reached the black hole vicinity
      const distToHole = Math.sqrt((star.x - holeX) ** 2 + (star.y - holeY) ** 2)

      // Special effect at the outer suck-in zone
      if (distToHole > blackHoleRadius * 1.8 && distToHole < blackHoleRadius * 2.0) {
        // Add a pulse effect
        trails.push({
          x: star.x,
          y: star.y,
          r: star.size * 2,
          hue: 220,
          alpha: 0.125,
          ripple: true
        })
      }

      // Only make shooting stars disappear when they reach the event horizon (similar to asteroids)
      if (distToHole < blackHoleRadius * 0.8) {
        // Create more dramatic trail effect when disappearing into black hole
        trails.push({
          x: star.x,
          y: star.y,
          r: star.size * 4,
          hue: 220,
          alpha: 0.3,
          ripple: false
        })

        // Add a second smaller trail for visual effect
        trails.push({
          x: star.x - star.vx * 2,
          y: star.y - star.vy * 2,
          r: star.size * 2,
          hue: 200,
          alpha: 0.2,
          ripple: false
        })

        star.active = false
      }

      // Check if out of bounds
      if (star.x < -50 || star.x > canvas.width + 50 || star.y < -50 || star.y > canvas.height + 50) {
        star.active = false
      }
    }

    // Update and draw spaceship only if active
    updateSpaceship()
    if (ship.active) {
      drawSpaceship()
    } else {
      // For the first spawn only, use random edge instead of last exit edge
      // Check if this is the initial spawn
      if (!ship.hasBeenActive && Date.now() > ship.respawnTime) {
        spawnShipFromRandomEdge()
        ship.hasBeenActive = true
      }
    }

    animationFrameRef = requestAnimationFrame(draw)
  }

  function updateSpaceship() {
    const currentTime = Date.now()

    // Check if ship is inactive and needs to be respawned
    if (!ship.active) {
      // Simple respawn check without additional conditions
      if (currentTime > ship.respawnTime) {
        // Always reset explosion state for safety
        ship.exploding = false
        ship.explosionParticles = []

        spawnShipFromLastExitEdge()
      } else {
        // Ship is inactive and waiting to spawn
        return
      }
    }

    // If ship is exploding, update explosion but don't update ship movement
    if (ship.exploding) {
      return
    }

    // Check for collision with asteroids
    if (ship.active && !ship.exploding) {
      // Proactive asteroid avoidance
      let nearestAsteroid = null
      let minDistance = Infinity
      let asteroidThreat = false
      let targetAngle = ship.angle // Initialize target angle for asteroid avoidance
      let speedMultiplier = 1.0 // Initialize speed for asteroid avoidance
      const detectionRange = 150 // Base detection range for asteroids

      // Find nearest asteroid and check for potential collisions
      for (let i = 0; i < asteroids.length; i++) {
        const asteroid = asteroids[i]
        if (asteroid.merged || asteroid.r < 3) continue // Skip small asteroids

        const dx = ship.x - asteroid.x
        const dy = ship.y - asteroid.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const collisionThreshold = ship.size + asteroid.r

        // Check for immediate collision
        if (distance < collisionThreshold) {
          // Collision detected - trigger explosion
          ship.exploding = true
          ship.explosionTime = Date.now()

          // Create explosion particles
          ship.explosionParticles = []

          // Create main burst particles - same as click explosion
          const particleCount = 60
          for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 0.5 + Math.random() * 1.8
            const sizeVariation = 0.8 + Math.random() * 0.7
            const baseSize = 2.0 + Math.random() * ship.size * 1.2

            ship.explosionParticles.push({
              x: ship.x,
              y: ship.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: baseSize * sizeVariation,
              alpha: 0.8 + Math.random() * 0.2,
              hue: 5 + Math.random() * 10
            })
          }

          // Create more central particles for a denser explosion
          for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 0.2 + Math.random() * 0.6
            ship.explosionParticles.push({
              x: ship.x + (Math.random() * 4 - 2),
              y: ship.y + (Math.random() * 4 - 2),
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: 1.5 + Math.random() * ship.size * 0.5,
              alpha: 0.9,
              hue: 2 + Math.random() * 8
            })
          }

          // Add ripple effects
          for (let i = 0; i < 4; i++) {
            const delay = i * 50
            const initialSize = ship.size * (0.6 + i * 0.2)

            setTimeout(() => {
              if (ship.exploding) {
                trails.push({
                  x: ship.x,
                  y: ship.y,
                  r: initialSize,
                  hue: 10 + Math.random() * 10,
                  alpha: 0.25 - i * 0.05,
                  ripple: false
                })
              }
            }, delay)
          }

          // Add immediate fire trails
          for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2
            const distance = 2 + Math.random() * ship.size * 0.6
            trails.push({
              x: ship.x + Math.cos(angle) * distance,
              y: ship.y + Math.sin(angle) * distance,
              r: 1.2 + Math.random() * ship.size * 0.4,
              hue: 10,
              alpha: 0.8,
              ripple: false
            })
          }

          // Set respawn time
          ship.active = false
          ship.respawnTime = currentTime + 8000 + Math.random() * 15000

          // Exit early as we're now exploding
          return
        }

        // Proactive avoidance - check for potential future collisions
        // Increase detection range for earlier avoidance
        const adjustedDetectionRange = detectionRange + asteroid.r * 2 // Larger asteroids can be detected from further away
        const asteroidSpeed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy)
        const shipSpeed = ship.speed
        const relativeSpeed = asteroidSpeed + shipSpeed

        // Look further ahead in time for potential collisions
        const timeToLookAhead = 3.0 // seconds to look ahead

        // Predict future positions
        const shipFutureX = ship.x + Math.cos(ship.angle) * ship.speed * timeToLookAhead * 60
        const shipFutureY = ship.y + Math.sin(ship.angle) * ship.speed * timeToLookAhead * 60
        const asteroidFutureX = asteroid.x + asteroid.vx * timeToLookAhead * 60
        const asteroidFutureY = asteroid.y + asteroid.vy * timeToLookAhead * 60

        // Calculate distance between future positions
        const futureDx = shipFutureX - asteroidFutureX
        const futureDy = shipFutureY - asteroidFutureY
        const futureDistance = Math.sqrt(futureDx * futureDx + futureDy * futureDy)

        // Calculate current time to collision based on velocities
        const timeToCollision = distance / (relativeSpeed + 0.0001) // Add small value to avoid division by zero

        // Check if asteroid is on a collision course - either currently or in the predicted future
        if (
          (distance < adjustedDetectionRange && timeToCollision < timeToLookAhead) ||
          futureDistance < (ship.size + asteroid.r) * 2
        ) {
          // Calculate relative velocity vector
          const relativeVx = asteroid.vx - Math.cos(ship.angle) * ship.speed
          const relativeVy = asteroid.vy - Math.sin(ship.angle) * ship.speed
          const relativeAngle = Math.atan2(relativeVy, relativeVx)

          // Check if asteroid is moving towards ship or if future positions are too close
          const dotProduct = Math.cos(relativeAngle) * dx + Math.sin(relativeAngle) * dy
          if (dotProduct < 0 || futureDistance < (ship.size + asteroid.r) * 2) {
            asteroidThreat = true

            // Calculate threat level (1.0 = immediate collision, 0.0 = distant threat)
            const distanceRange = adjustedDetectionRange - collisionThreshold
            const threatLevel =
              1.0 - Math.min(1.0, (distance - collisionThreshold) / (distanceRange > 0 ? distanceRange : 1))

            // Store the nearest/most threatening asteroid
            if (distance < minDistance || (distance < adjustedDetectionRange * 0.7 && threatLevel > 0.7)) {
              minDistance = distance
              nearestAsteroid = asteroid
            }
          }
        }
      }

      // If there's a threatening asteroid, perform evasive maneuver
      if (asteroidThreat && nearestAsteroid) {
        // Calculate angle away from asteroid
        const dx = ship.x - nearestAsteroid.x
        const dy = ship.y - nearestAsteroid.y
        const awayAngle = Math.atan2(dy, dx)

        // Calculate the asteroid's movement direction
        const asteroidAngle = Math.atan2(nearestAsteroid.vy, nearestAsteroid.vx)

        // Calculate current angle difference
        let angleDiff = awayAngle - ship.angle
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        // Determine which direction to turn (left or right)
        // Choose the direction that's faster to turn to safety
        // const turnLeft = angleDiff > 0; // Unused, so commented out

        // Calculate perpendicular angles (90 degrees to either side)
        const perpendicularLeftAngle = (asteroidAngle + Math.PI / 2) % (Math.PI * 2)
        const perpendicularRightAngle = (asteroidAngle - Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)

        // Choose best evasion angle based on ship's current direction and asteroid movement
        // This helps avoid turning into the asteroid's path
        let bestEvasionAngle

        // Calculate dot products to determine which perpendicular direction is better
        const dotLeft =
          Math.cos(perpendicularLeftAngle) * Math.cos(ship.angle) +
          Math.sin(perpendicularLeftAngle) * Math.sin(ship.angle)
        const dotRight =
          Math.cos(perpendicularRightAngle) * Math.cos(ship.angle) +
          Math.sin(perpendicularRightAngle) * Math.sin(ship.angle)

        // Choose the perpendicular direction that requires less turning
        if (dotLeft > dotRight) {
          bestEvasionAngle = perpendicularLeftAngle
        } else {
          bestEvasionAngle = perpendicularRightAngle
        }

        // Emergency collision avoidance for very close asteroids
        if (minDistance < (ship.size + nearestAsteroid.r) * 2) {
          // For immediate threats, directly away is best
          targetAngle = awayAngle
          speedMultiplier = 1.5 // Speed boost to escape
        } else {
          // For less immediate threats, use the calculated best evasion angle
          targetAngle = bestEvasionAngle
          speedMultiplier = 1.3 // Moderate speed boost
        }

        // Make the ship instantly turn toward escape direction for close threats
        if (minDistance < (ship.size + nearestAsteroid.r) * 3) {
          // Apply immediate angle change toward target direction
          ship.angle = ship.angle * 0.3 + targetAngle * 0.7
        }

        // Add visual feedback for asteroid avoidance - larger/brighter for closer threats
        const nearAsteroidDetectionRange = detectionRange + nearestAsteroid.r * 2
        const proximityFactor = Math.min(1.0, (nearAsteroidDetectionRange - minDistance) / nearAsteroidDetectionRange)
        trails.push({
          x: ship.x,
          y: ship.y,
          r: 6 + proximityFactor * 4,
          hue: 300, // Purple for asteroid avoidance
          alpha: 0.3 + proximityFactor * 0.4,
          ripple: false
        })

        // Add warning trail pointing to asteroid
        const warningLength = 5 + proximityFactor * 10
        const warningDirection = Math.atan2(nearestAsteroid.y - ship.y, nearestAsteroid.x - ship.x)
        trails.push({
          x: ship.x + Math.cos(warningDirection) * warningLength,
          y: ship.y + Math.sin(warningDirection) * warningLength,
          r: 4,
          hue: 0, // Red warning trail
          alpha: 0.3 + proximityFactor * 0.4,
          ripple: false
        })

        // Apply the avoidance speed
        ship.speed *= speedMultiplier

        // Return here to prioritize asteroid avoidance over other movement patterns
        // But don't return for distant threats to allow combined black hole avoidance
        if (minDistance < (ship.size + nearestAsteroid.r) * 5) {
          // Update position after avoidance maneuver
          ship.x += Math.cos(ship.angle) * ship.speed
          ship.y += Math.sin(ship.angle) * ship.speed

          // Ensure normal movement doesn't override our avoidance by returning early
          // but only for imminent threats
          return
        }
      }
    }

    // Check distance to black hole for avoidance
    const dxHole = ship.x - holeX
    const dyHole = ship.y - holeY
    const distToHole = Math.sqrt(dxHole * dxHole + dyHole * dyHole)

    // Define danger zone - even smaller than escape zone
    const dangerZoneThreshold = blackHoleRadius * 2.25
    const isInDangerZone = distToHole < dangerZoneThreshold

    // Helper function to select a safe exit edge that avoids paths through the black hole
    function selectSafeExitEdge() {
      // Create an array with edges that aren't the entry edge
      const availableEdges = [0, 1, 2, 3].filter(edge => edge !== ship.entryEdge)

      // Calculate position of black hole center
      const blackHolePos = { x: holeX, y: holeY }

      // Calculate safety scores for each possible exit edge
      const edgeScores = availableEdges.map(edge => {
        // Get exit coordinates for this edge
        const exitPos = getExitCoordsForEdge(edge)

        // Calculate distance from black hole to line segment from ship to exit
        const safetyScore = distanceFromLineToPoint({ x: ship.x, y: ship.y }, exitPos, blackHolePos)

        return { edge, safetyScore }
      })

      // Sort by safety score (higher is better - further from black hole)
      edgeScores.sort((a, b) => b.safetyScore - a.safetyScore)

      // Choose the safest edge (furthest path from black hole)
      ship.targetExitEdge = edgeScores[0].edge
    }

    // Calculate exit coordinates for a specific edge (for path safety calculation)
    function getExitCoordsForEdge(edge: number) {
      const isPortrait = canvas!.height > canvas!.width
      const margin = ship.size * 2
      let targetX, targetY

      if (edge === 0) {
        // Top edge
        targetX = ship.x < canvas!.width / 2 ? canvas!.width - margin * 4 : margin * 4
        targetY = -margin
      } else if (edge === 1) {
        // Right edge
        targetX = canvas!.width + margin
        const offsetY = isPortrait ? canvas!.height * 0.15 : margin * 2
        targetY = ship.y < canvas!.height / 2 ? canvas!.height - offsetY : offsetY
      } else if (edge === 2) {
        // Bottom edge
        targetX = ship.x < canvas!.width / 2 ? canvas!.width - margin * 4 : margin * 4
        targetY = canvas!.height + margin
      } else {
        // Left edge
        targetX = -margin
        const offsetY = isPortrait ? canvas!.height * 0.15 : margin * 2
        targetY = ship.y < canvas!.height / 2 ? canvas!.height - offsetY : offsetY
      }

      return { x: targetX, y: targetY }
    }

    // Calculate minimum distance from a line segment to a point
    function distanceFromLineToPoint(
      lineStart: { x: number; y: number },
      lineEnd: { x: number; y: number },
      point: { x: number; y: number }
    ) {
      const dx = lineEnd.x - lineStart.x
      const dy = lineEnd.y - lineStart.y
      const lineLengthSquared = dx * dx + dy * dy

      // Special case for zero-length line
      if (lineLengthSquared === 0) {
        return Math.sqrt(
          (point.x - lineStart.x) * (point.x - lineStart.x) + (point.y - lineStart.y) * (point.y - lineStart.y)
        )
      }

      // Calculate projection of point onto line
      const t = Math.max(
        0,
        Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSquared)
      )

      // Calculate closest point on line segment
      const closestX = lineStart.x + t * dx
      const closestY = lineStart.y + t * dy

      // Return distance to closest point
      return Math.sqrt((point.x - closestX) * (point.x - closestX) + (point.y - closestY) * (point.y - closestY))
    }

    // Check if ship just entered the danger zone
    if (isInDangerZone && !ship.inDangerZone) {
      ship.inDangerZone = true

      // Change target to an edge that ensures the ship won't fly through the black hole
      selectSafeExitEdge()

      // Add a visual cue showing redirection
      trails.push({
        x: ship.x,
        y: ship.y,
        r: 12,
        hue: 60, // Yellow warning trail
        alpha: 0.6,
        ripple: false
      })
    } else if (!isInDangerZone && ship.inDangerZone) {
      // Ship has exited the danger zone
      ship.inDangerZone = false
    }

    // Calculate the direct exit angle (direction to opposite side)
    const exitAngle = getTargetExitAngle()

    // Store the exit coordinates for forward progress checking
    const exitCoords = getExitCoordinates()

    // Calculate the vector from current position to exit point
    const dxExit = exitCoords.x - ship.x
    const dyExit = exitCoords.y - ship.y

    // Determine target angle using a more logical orbital mechanics approach
    const isPortrait = canvas!.height > canvas!.width
    const influenceRadius = blackHoleRadius * (isPortrait ? 10 : 12)
    const criticalRadius = blackHoleRadius * 3.5

    // Initialize variables for evasive maneuvers
    const timeBasedVariation = Math.sin(Date.now() * 0.001) * 0.5 + 0.5 // 0 to 1 oscillation
    const randomFactor = Math.sin(Date.now() * 0.0003 + ship.x * 0.01) * 0.5 + 0.5 // Another oscillation with different frequency

    // By default, head toward the exit
    let targetAngle = exitAngle
    let avoidanceFactor = 0

    // Occasional evasive maneuvers
    const performingEvasiveManeuver = distToHole < influenceRadius && Math.random() < 0.005
    let evasiveAngleOffset = 0
    let speedMultiplier = 1.0

    if (performingEvasiveManeuver) {
      // Add a dramatic burst and ripple effect to indicate evasive maneuver
      const maneuverType = Math.floor(Math.random() * 2) // 0 or 1 (removed option 2)
      const burstColor = [60, 190][maneuverType] // Yellow or Cyan (removed Purple for zigzag)

      // Visual feedback for evasive maneuver
      trails.push({
        x: ship.x,
        y: ship.y,
        r: 8,
        hue: burstColor,
        alpha: 0.5,
        ripple: false
      })

      // Add a small trail burst behind the ship
      for (let i = 0; i < 3; i++) {
        const offset = (i + 1) * 1.5
        trails.push({
          x: ship.x - Math.cos(ship.angle) * offset,
          y: ship.y - Math.sin(ship.angle) * offset,
          r: 2 - i * 0.3,
          hue: burstColor,
          alpha: 0.4 - i * 0.1,
          ripple: false
        })
      }

      // Different types of evasive maneuvers
      if (maneuverType === 0) {
        // Sharp turn - dramatic angle change
        evasiveAngleOffset = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 4 + (Math.random() * Math.PI) / 4)
        speedMultiplier = 0.7 // Slow down during sharp turn
      } else {
        // Speed burst - minor angle change but faster
        evasiveAngleOffset = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 8)
        speedMultiplier = 1.5 // Faster during speed burst
      }
    }

    // Only apply black hole influence if within its influence radius
    if (distToHole < influenceRadius) {
      // Calculate normalized influence factor (1 at the black hole, 0 at influence edge)
      const influenceFactor = 1 - distToHole / influenceRadius

      // Calculate angle away from black hole
      const awayAngle = Math.atan2(dyHole, dxHole)

      // Use time-based oscillation to occasionally switch orbital direction preference
      // This makes the ship sometimes prefer clockwise, sometimes counterclockwise
      const preferClockwise = Math.sin(Date.now() * 0.0006 + ship.x * 0.01) > 0

      // Choose the orbital direction that better aligns with exit path
      // But occasionally override with a preference based on time
      const clockwiseOrbit = awayAngle + Math.PI / 2
      const counterClockwiseOrbit = awayAngle - Math.PI / 2

      // Determine which orbital direction to use
      let orbitAngle

      // Normally choose direction based on exit alignment
      const dotClockwise = Math.cos(clockwiseOrbit) * dxExit + Math.sin(clockwiseOrbit) * dyExit
      const dotCounterClockwise = Math.cos(counterClockwiseOrbit) * dxExit + Math.sin(counterClockwiseOrbit) * dyExit

      // Sometimes override the logical choice with time-based preference
      if (Math.random() < 0.1 && influenceFactor > 0.4) {
        orbitAngle = preferClockwise ? clockwiseOrbit : counterClockwiseOrbit

        // Add a visual cue for this decision
        if (Math.random() < 0.3) {
          trails.push({
            x: ship.x,
            y: ship.y,
            r: 5,
            hue: preferClockwise ? 240 : 140, // Blue or green
            alpha: 0.4,
            ripple: false
          })
        }
      } else {
        // Use standard logic - choose direction that better aligns with exit
        orbitAngle = dotClockwise > dotCounterClockwise ? clockwiseOrbit : counterClockwiseOrbit
      }

      // When very close to the black hole, prioritize moving away
      // When at medium distance, prioritize orbital movement
      // When far away, prioritize exit direction
      let directWeight = 0
      let orbitWeight = 0
      let exitWeight = 0

      if (distToHole < criticalRadius) {
        // Add variation to critical behavior based on time
        const escapeIntensity = Math.pow(1 - distToHole / criticalRadius, 1.2) * (0.9 + timeBasedVariation * 0.2)

        // Variable weights with some randomness
        directWeight = (0.2 + randomFactor * 0.2) * escapeIntensity
        orbitWeight = 0.5 + 0.3 * escapeIntensity * (1 - randomFactor * 0.3)
        exitWeight = 1 - directWeight - orbitWeight
      } else {
        // Beyond critical radius - blend orbital and exit with smooth transition and variation
        const t = (distToHole - criticalRadius) / (influenceRadius - criticalRadius)

        // Add variations to the blend
        const tVaried = t * (0.9 + randomFactor * 0.2)
        orbitWeight = 0.6 * (1 - Math.pow(tVaried, 0.7 + timeBasedVariation * 0.3))
        exitWeight = 1 - orbitWeight
      }

      // Add the evasive maneuver angle offset to the mix
      const evasiveAngleInfluence = performingEvasiveManeuver ? 0.7 : 0

      // Blend the angles based on calculated weights with evasive maneuver influence
      targetAngle =
        (awayAngle * directWeight +
          orbitAngle * orbitWeight +
          exitAngle * exitWeight +
          (ship.angle + evasiveAngleOffset) * evasiveAngleInfluence) /
        (directWeight + orbitWeight + exitWeight + evasiveAngleInfluence)

      // Calculate avoidance factor for thruster effects
      avoidanceFactor = Math.min(0.9, influenceFactor * (distToHole < criticalRadius ? 1.0 : 0.6))
    } else if (performingEvasiveManeuver) {
      // Even outside influence radius, we can still execute evasive maneuvers occasionally
      targetAngle = ship.angle + evasiveAngleOffset
    }

    // Smoothly turn toward target angle
    let angleDiff = targetAngle - ship.angle

    // Handle angle wrap-around
    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    // Use a variable turn rate for more natural movement
    // Higher avoidance factor or being in an evasive maneuver means more responsive turns
    const turnResponsiveness = performingEvasiveManeuver ? 1.2 : 0.8 + avoidanceFactor * 0.4
    const baseTurnRate = 0.04 // Base value
    const maxTurnRate = baseTurnRate * turnResponsiveness

    if (angleDiff > maxTurnRate) angleDiff = maxTurnRate
    if (angleDiff < -maxTurnRate) angleDiff = -maxTurnRate

    // Apply steering with consistent factor to avoid jerky movements
    // Add slight randomness to steering responsiveness for more natural movement
    const steeringFactor = (0.3 + 0.2 * avoidanceFactor) * (0.95 + Math.random() * 0.1)
    ship.angle += angleDiff * steeringFactor

    // Maintain angle in range [0, 2π]
    if (ship.angle > Math.PI * 2) ship.angle -= Math.PI * 2
    if (ship.angle < 0) ship.angle += Math.PI * 2

    // Adjust speed with more variation
    // Base adjustment on proximity to black hole
    let speedAdjustment = distToHole < criticalRadius ? 0.85 - 0.15 * (1 - distToHole / criticalRadius) : 1.0

    // Add time-based variation to speed
    speedAdjustment *= 0.95 + timeBasedVariation * 0.1

    // Apply evasive maneuver speed multiplier if active
    if (performingEvasiveManeuver) {
      speedAdjustment *= speedMultiplier
    }

    // Random small bursts of speed occasionally (even when not in evasive maneuver)
    if (Math.random() < 0.005) {
      speedAdjustment *= 1.2 + Math.random() * 0.3

      // Add visual feedback for speed burst
      trails.push({
        x: ship.x - Math.cos(ship.angle) * ship.size,
        y: ship.y - Math.sin(ship.angle) * ship.size,
        r: 7,
        hue: 200 + Math.random() * 40,
        alpha: 0.5,
        ripple: false
      })
    }

    ship.speed = 0.7 * speedAdjustment

    // Update ship position
    ship.x += Math.cos(ship.angle) * ship.speed
    ship.y += Math.sin(ship.angle) * ship.speed

    // Visual thruster effect intensity based on black hole proximity and speed
    const thrusterIntensity = 0.6 + 0.2 * Math.sin(Date.now() * 0.01) + 0.3 * avoidanceFactor
    // Increase thruster effect during speed adjustments
    ship.thrusterAlpha = thrusterIntensity * (speedAdjustment > 1.1 ? 1.3 : 1.0)

    // Add trail - more intense when closer to black hole
    // Higher chance during evasive maneuvers or high speeds
    const trailChance = performingEvasiveManeuver
      ? 0.5
      : speedAdjustment > 1.1
      ? 0.5
      : avoidanceFactor > 0.5
      ? 0.5
      : 0.3

    if (Math.random() < trailChance) {
      // Calculate trail color based on ship's situation
      let trailHue
      if (performingEvasiveManeuver) {
        // Evasive maneuvers get distinctive colors
        trailHue = [60, 190][Math.floor(Math.random() * 2)]
      } else if (avoidanceFactor > 0.7) {
        // Danger zone gets red/orange tones
        trailHue = 0 + Math.random() * 30
      } else if (speedAdjustment > 1.1) {
        // Speed bursts get blue tones
        trailHue = 220 + Math.random() * 40
      } else {
        // Normal trails get cyan/blue tones
        trailHue = 180 + Math.random() * 60
      }

      trails.push({
        x: ship.x - Math.cos(ship.angle) * ship.size * 0.8,
        y: ship.y - Math.sin(ship.angle) * ship.size * 0.8,
        r:
          2 +
          Math.random() *
            (performingEvasiveManeuver ? 2 : avoidanceFactor > 0.7 ? 2.5 : speedAdjustment > 1.1 ? 2.2 : 1.5),
        hue: trailHue,
        alpha:
          0.2 +
          Math.random() * 0.1 +
          (performingEvasiveManeuver ? 0.2 : avoidanceFactor > 0.7 ? 0.2 : speedAdjustment > 1.1 ? 0.15 : 0),
        ripple: false
      })
    }

    // Check if ship has left the canvas
    const margin = ship.size * 2
    if (ship.x < -margin || ship.x > canvas!.width + margin || ship.y < -margin || ship.y > canvas!.height + margin) {
      // Determine which edge the ship exited from
      let exitEdge
      if (ship.x < -margin) exitEdge = 3 // Left edge
      else if (ship.x > canvas!.width + margin) exitEdge = 1 // Right edge
      else if (ship.y < -margin) exitEdge = 0 // Top edge
      else exitEdge = 2 // Bottom edge

      // Verify this is the expected exit edge
      if (exitEdge !== ship.targetExitEdge) {
        // If ship is attempting to exit from a non-target edge, redirect it

        // Find the target coordinates for the correct exit
        let targetX, targetY
        if (ship.targetExitEdge === 0) {
          // Top
          targetX = ship.x
          targetY = -margin
        } else if (ship.targetExitEdge === 1) {
          // Right
          targetX = canvas!.width + margin
          targetY = ship.y
        } else if (ship.targetExitEdge === 2) {
          // Bottom
          targetX = ship.x
          targetY = canvas!.height + margin
        } else {
          // Left
          targetX = -margin
          targetY = ship.y
        }

        // Calculate angle to correct exit
        const dx = targetX - ship.x
        const dy = targetY - ship.y
        const angleToExit = Math.atan2(dy, dx)

        // Adjust ship's angle to move toward correct exit
        ship.angle = angleToExit

        // Force-move ship in this direction to correct its path
        ship.x += Math.cos(ship.angle) * ship.speed * 2
        ship.y += Math.sin(ship.angle) * ship.speed * 2

        // Add a colored trail to indicate course correction
        trails.push({
          x: ship.x - Math.cos(ship.angle) * ship.size * 0.8,
          y: ship.y - Math.sin(ship.angle) * ship.size * 0.8,
          r: 3,
          hue: 60, // Yellow warning trail
          alpha: 0.4,
          ripple: false
        })

        // Early return to continue movement
        return
      }

      // Ship has successfully exited from the correct target edge
      ship.lastExitEdge = exitEdge
      ship.active = false
      ship.inDangerZone = false

      // Set longer random respawn time
      ship.respawnTime = currentTime + 8000 + Math.random() * 15000
    }

    // Add a small, faint ripple/burst effect
    // Simple ripples that expand outward
    for (let i = 0; i < 4; i++) {
      // Stagger the ripples slightly
      const delay = i * 50
      const initialSize = ship.size * (0.6 + i * 0.2)

      setTimeout(() => {
        if (ship.exploding) {
          // Only add if still exploding
          trails.push({
            x: ship.x,
            y: ship.y,
            r: initialSize,
            hue: 10 + Math.random() * 10,
            alpha: 0.25 - i * 0.05, // Fainter for later ripples
            ripple: false
          })
        }
      }, delay)
    }
  }

  function getExitCoordinates() {
    // Calculate the exact exit coordinates on the opposite edge
    // to maximize diagonal distance (corner-to-corner)
    const oppositeEdge = ship.targetExitEdge
    const isPortrait = canvas!.height > canvas!.width
    let targetX, targetY

    if (oppositeEdge === 0) {
      // Top edge
      // If ship entered from bottom, exit at opposite corner on top
      targetX = ship.x < canvas!.width / 2 ? canvas!.width - ship.size * 4 : ship.size * 4
      targetY = -ship.size * 2
    } else if (oppositeEdge === 1) {
      // Right edge
      // If ship entered from left, exit at opposite corner on right
      targetX = canvas!.width + ship.size * 2
      // In portrait, use a greater vertical offset to avoid extreme angle issues
      const offsetY = isPortrait ? canvas!.height * 0.15 : ship.size * 2
      targetY = ship.y < canvas!.height / 2 ? canvas!.height - offsetY : offsetY
    } else if (oppositeEdge === 2) {
      // Bottom edge
      // If ship entered from top, exit at opposite corner on bottom
      targetX = ship.x < canvas!.width / 2 ? canvas!.width - ship.size * 4 : ship.size * 4
      targetY = canvas!.height + ship.size * 2
    } else {
      // Left edge
      // If ship entered from right, exit at opposite corner on left
      targetX = -ship.size * 2
      // In portrait, use a greater vertical offset to avoid extreme angle issues
      const offsetY = isPortrait ? canvas!.height * 0.15 : ship.size * 2
      targetY = ship.y < canvas!.height / 2 ? canvas!.height - offsetY : offsetY
    }

    return { x: targetX, y: targetY }
  }

  function getTargetExitAngle() {
    // Calculate angle to the targeted exit edge
    const exitCoords = getExitCoordinates()

    // Calculate angle to this point
    return Math.atan2(exitCoords.y - ship.y, exitCoords.x - ship.x)
  }

  function spawnShipFromLastExitEdge() {
    // Ensure explosion state is completely cleared before respawning
    ship.exploding = false
    ship.explosionParticles = []

    // Use the last exit edge as the new entry edge
    ship.entryEdge = ship.lastExitEdge

    // Set the target exit to the opposite edge (standard behavior)
    ship.targetExitEdge = (ship.entryEdge + 2) % 4

    // Reset danger zone flag
    ship.inDangerZone = false

    const margin = ship.size * 2
    const isPortrait = canvas!.height > canvas!.width

    // Position ship at corner extremes for maximum distance
    // With special handling for portrait mode devices
    if (ship.entryEdge === 0) {
      // Top edge - position near left or right corner
      const cornerChoice = Math.random() < 0.5
      ship.x = cornerChoice ? margin * 2 : canvas!.width - margin * 2
      ship.y = -margin
      ship.angle = Math.PI / 2 // Pointing down
    } else if (ship.entryEdge === 1) {
      // Right edge - position near top or bottom corner
      const cornerChoice = Math.random() < 0.5
      ship.x = canvas!.width + margin
      // In portrait, increase the distance from corners
      const offsetY = isPortrait ? canvas!.height * 0.15 : margin * 2
      ship.y = cornerChoice ? offsetY : canvas!.height - offsetY
      ship.angle = Math.PI // Pointing left
    } else if (ship.entryEdge === 2) {
      // Bottom edge - position near left or right corner
      const cornerChoice = Math.random() < 0.5
      ship.x = cornerChoice ? margin * 2 : canvas!.width - margin * 2
      ship.y = canvas!.height + margin
      ship.angle = -Math.PI / 2 // Pointing up
    } else {
      // Left edge - position near top or bottom corner
      const cornerChoice = Math.random() < 0.5
      ship.x = -margin
      // In portrait, increase the distance from corners
      const offsetY = isPortrait ? canvas!.height * 0.15 : margin * 2
      ship.y = cornerChoice ? offsetY : canvas!.height - offsetY
      ship.angle = 0 // Pointing right
    }

    // Initial target angle is same as spawn angle
    ship.targetAngle = ship.angle
    ship.active = true
  }

  function spawnShipFromRandomEdge() {
    // Ensure explosion state is completely cleared before respawning
    ship.exploding = false
    ship.explosionParticles = []

    // Choose a random edge (0=top, 1=right, 2=bottom, 3=left)
    const entryEdge = Math.floor(Math.random() * 4)

    // Store which edge we're coming from
    ship.entryEdge = entryEdge

    // Set target to opposite edge (standard initial behavior)
    ship.targetExitEdge = (ship.entryEdge + 2) % 4

    // Reset danger zone flag
    ship.inDangerZone = false

    const margin = ship.size * 2
    const isPortrait = canvas!.height > canvas!.width

    // Position ship at corner extremes for maximum distance
    // With special handling for portrait mode devices
    if (entryEdge === 0) {
      // Top edge - position near left or right corner
      const cornerChoice = Math.random() < 0.5
      ship.x = cornerChoice ? margin * 2 : canvas!.width - margin * 2
      ship.y = -margin
      ship.angle = Math.PI / 2 // Pointing down
    } else if (entryEdge === 1) {
      // Right edge - position near top or bottom corner
      const cornerChoice = Math.random() < 0.5
      ship.x = canvas!.width + margin
      // In portrait, increase the distance from corners
      const offsetY = isPortrait ? canvas!.height * 0.15 : margin * 2
      ship.y = cornerChoice ? offsetY : canvas!.height - offsetY
      ship.angle = Math.PI // Pointing left
    } else if (entryEdge === 2) {
      // Bottom edge - position near left or right corner
      const cornerChoice = Math.random() < 0.5
      ship.x = cornerChoice ? margin * 2 : canvas!.width - margin * 2
      ship.y = canvas!.height + margin
      ship.angle = -Math.PI / 2 // Pointing up
    } else {
      // Left edge - position near top or bottom corner
      const cornerChoice = Math.random() < 0.5
      ship.x = -margin
      // In portrait, increase the distance from corners
      const offsetY = isPortrait ? canvas!.height * 0.15 : margin * 2
      ship.y = cornerChoice ? offsetY : canvas!.height - offsetY
      ship.angle = 0 // Pointing right
    }

    // Initial target angle is same as spawn angle
    ship.targetAngle = ship.angle
    ship.active = true
  }

  function drawSpaceship() {
    if (!ctx) return

    // Don't draw ship if exploding
    if (ship.exploding) {
      // FIRE EFFECT: Draw a bright glow under the particles for dramatic effect
      for (let i = 0; i < ship.explosionParticles.length; i++) {
        const p = ship.explosionParticles[i]

        // Add glow effect
        ctx.globalCompositeOperation = 'lighter'
        ctx.beginPath()

        // Create radial gradient for glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
        gradient.addColorStop(0, `rgba(255, 50, 0, ${p.alpha * 0.8})`)
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)')

        ctx.fillStyle = gradient
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fill()

        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over'
      }

      // Draw explosion particles
      for (let i = 0; i < ship.explosionParticles.length; i++) {
        const p = ship.explosionParticles[i]

        // Draw particle - use a rectangle with random rotation for more natural fire
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(Math.random() * Math.PI * 2)

        // Use rectangles for some particles to avoid perfect circles
        if (Math.random() < 0.4) {
          const w = p.size * (0.7 + Math.random() * 0.6)
          const h = p.size * (0.7 + Math.random() * 0.6)
          ctx.fillRect(-w / 2, -h / 2, w, h)
        } else {
          // Use oval for others
          ctx.scale(0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4)
          ctx.beginPath()
          ctx.arc(0, 0, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()

        // Update particle position with more irregular movement - slower decay for larger explosion
        p.x += p.vx + (Math.random() * 0.4 - 0.2)
        p.y += p.vy + (Math.random() * 0.4 - 0.2)

        // Slightly slower shrinking for larger explosion duration
        p.size *= 0.94

        // Slightly slower fade out for longer visible explosion
        p.alpha -= 0.025

        // Remove particles that get too small or transparent
        if (p.size < 0.5 || p.alpha < 0.1) {
          ship.explosionParticles.splice(i, 1)
          i--
          continue
        }

        // Slow down with some randomness
        p.vx *= 0.94 + Math.random() * 0.02
        p.vy *= 0.94 + Math.random() * 0.02

        // Add fewer trails with smaller size
        if (Math.random() < 0.4) {
          trails.push({
            x: p.x,
            y: p.y,
            r: p.size * 0.6,
            hue: p.hue,
            alpha: p.alpha * 0.5,
            ripple: false
          })
        }
      }

      // Check if explosion is finished
      const currentTime = Date.now()
      if (currentTime - ship.explosionTime > 1000) {
        // Complete cleanup - ensure no particles remain
        ship.exploding = false
        ship.explosionParticles = []

        // Make sure the ship will respawn with longer delay if respawn time is invalid
        if (!ship.active && ship.respawnTime <= 0) {
          ship.respawnTime = currentTime + 8000 + Math.random() * 15000
        }

        // Remove any trails that might be related to the explosion
        for (let i = trails.length - 1; i >= 0; i--) {
          const t = trails[i]
          if (Math.abs(t.x - ship.x) < 50 && Math.abs(t.y - ship.y) < 50) {
            trails.splice(i, 1)
          }
        }
      }

      return
    }

    // Regular ship drawing logic
    ctx.save()
    ctx.translate(ship.x, ship.y)
    ctx.rotate(ship.angle)

    // Draw ship body
    ctx.fillStyle = '#8af'
    ctx.beginPath()
    ctx.moveTo(ship.size, 0)
    ctx.lineTo(-ship.size / 2, -ship.size / 2)
    ctx.lineTo(-ship.size / 3, 0)
    ctx.lineTo(-ship.size / 2, ship.size / 2)
    ctx.closePath()
    ctx.fill()

    // Draw cockpit
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ship.size / 3, 0, ship.size / 4, 0, Math.PI * 2)
    ctx.fill()

    // Draw engine glow
    ctx.fillStyle = `rgba(255, 100, 30, ${ship.thrusterAlpha})`
    ctx.beginPath()
    ctx.moveTo(-ship.size / 2, -ship.size / 4)
    ctx.lineTo(-ship.size * 1.2, 0)
    ctx.lineTo(-ship.size / 2, ship.size / 4)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  const onResize = () => {
    resizeCanvas()
    asteroidCount = Math.floor((canvas!.width * canvas!.height) / 8000)
    holeX = canvas!.width / 2
    holeY = canvas!.height / 2

    // Regenerate waypoints when window is resized
    generateWaypoints()

    // Reset ship (if it was active) to come from a random edge after resize
    if (ship.active) {
      ship.active = false
      ship.respawnTime = Date.now() + 3000
    }
  }

  const onMouseMove = (e: MouseEvent) => {
    mouseRef.x = e.clientX
    mouseRef.y = e.clientY
  }

  const onMouseOut = () => {
    mouseRef.x = null
    mouseRef.y = null
  }

  const onClick = (e: MouseEvent) => {
    const cx = e.clientX
    const cy = e.clientY

    // Create click ripple effect
    trails.push({ x: cx, y: cy, r: 6.5, hue: 0, alpha: 0.3, ripple: true })

    // Check if ship is close to the click location
    if (ship.active && !ship.exploding) {
      const dx = ship.x - cx
      const dy = ship.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const explosionThreshold = 25 // REDUCED explosion threshold (was 40)
      const pushThreshold = 180 // INCREASED push threshold (was 150)

      if (dist < explosionThreshold) {
        // Ship is too close to click burst, trigger explosion
        ship.exploding = true
        ship.explosionTime = Date.now()

        // Create explosion particles
        ship.explosionParticles = []

        // Create main burst particles - MORE particles and LARGER size
        const particleCount = 60 // Increased count
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2

          // Higher speed for larger explosion radius
          const speed = 0.5 + Math.random() * 1.8

          // Larger particles
          const sizeVariation = 0.8 + Math.random() * 0.7
          const baseSize = 2.0 + Math.random() * ship.size * 1.2 // Much larger particles

          ship.explosionParticles.push({
            x: ship.x,
            y: ship.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: baseSize * sizeVariation,
            alpha: 0.8 + Math.random() * 0.2,
            hue: 5 + Math.random() * 10
          })
        }

        // Create more central particles for a denser explosion
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2
          const speed = 0.2 + Math.random() * 0.6 // Slower inner particles
          ship.explosionParticles.push({
            x: ship.x + (Math.random() * 4 - 2), // Small random offset
            y: ship.y + (Math.random() * 4 - 2), // Small random offset
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 1.5 + Math.random() * ship.size * 0.5, // Larger inner particles
            alpha: 0.9,
            hue: 2 + Math.random() * 8
          })
        }

        // Add a small, faint ripple/burst effect
        // Simple ripples that expand outward
        for (let i = 0; i < 4; i++) {
          // Stagger the ripples slightly
          const delay = i * 50
          const initialSize = ship.size * (0.6 + i * 0.2)

          setTimeout(() => {
            if (ship.exploding) {
              // Only add if still exploding
              trails.push({
                x: ship.x,
                y: ship.y,
                r: initialSize,
                hue: 10 + Math.random() * 10,
                alpha: 0.25 - i * 0.05, // Fainter for later ripples
                ripple: true
              })
            }
          }, delay)
        }

        // Add immediate fire trails for initial burst
        for (let i = 0; i < 12; i++) {
          const angle = Math.random() * Math.PI * 2
          const distance = 2 + Math.random() * ship.size * 0.6
          trails.push({
            x: ship.x + Math.cos(angle) * distance,
            y: ship.y + Math.sin(angle) * distance,
            r: 1.2 + Math.random() * ship.size * 0.4,
            hue: 10,
            alpha: 0.8,
            ripple: false
          })
        }

        // Schedule respawn after explosion with longer delay and more randomness
        ship.active = false
        ship.respawnTime = Date.now() + 8000 + Math.random() * 15000
      } else if (dist < pushThreshold) {
        // Ship is close enough to be pushed but not explode

        // Calculate push direction (from click to ship)
        const pushAngle = Math.atan2(dy, dx)

        // Calculate push strength based on distance (closer = stronger push)
        // AMPLIFIED push strength by increasing the base multiplier from 0.4 to 0.7
        const pushStrength = 0.7 * (1 - dist / pushThreshold)

        // AMPLIFIED position adjustment from 5 to 8
        ship.x += Math.cos(pushAngle) * pushStrength * 8
        ship.y += Math.sin(pushAngle) * pushStrength * 8

        // Gradually align ship's angle with the push direction
        let angleDiff = pushAngle - ship.angle

        // Handle angle wrap-around
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        // AMPLIFIED angle adjustment from 0.6 to 0.8
        ship.angle += angleDiff * pushStrength * 0.8

        // Keep angle in range [0, 2π]
        if (ship.angle > Math.PI * 2) ship.angle -= Math.PI * 2
        if (ship.angle < 0) ship.angle += Math.PI * 2

        // Add more dramatic visual trail to show the stronger push effect
        trails.push({
          x: ship.x,
          y: ship.y,
          r: 6, // Increased from 5
          hue: 200, // Blue push trail
          alpha: 0.7, // Increased from 0.5
          ripple: false
        })

        // Add a secondary trail effect for more dramatic push visual
        if (pushStrength > 0.3) {
          trails.push({
            x: ship.x - Math.cos(pushAngle) * 4,
            y: ship.y - Math.sin(pushAngle) * 4,
            r: 4,
            hue: 220,
            alpha: 0.5,
            ripple: false
          })
        }
      }
    }

    // Apply push effect to asteroids
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i]
      const dx = a.x - cx
      const dy = a.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const pushRadius = 200
      if (dist < pushRadius) {
        const strength = (1 - dist / pushRadius) * 0.65
        a.vx += dx * strength * 0.1
        a.vy += dy * strength * 0.1
      }
    }

    // Apply very subtle push effect to shooting stars
    for (let i = 0; i < shootingStars.length; i++) {
      const star = shootingStars[i]
      const dx = star.x - cx
      const dy = star.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const pushRadius = 200
      if (dist < pushRadius) {
        // Increased effect for shooting stars (about 1/2 of asteroid effect)
        const strength = (1 - dist / pushRadius) * 0.3
        star.vx += dx * strength * 0.04
        star.vy += dy * strength * 0.04
      }
    }
  }

  // Start animation
  draw()

  // Add event listeners
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseout', onMouseOut)
  window.addEventListener('click', onClick)

  // Handle touch events for mobile devices
  const onTouchStart = (e: TouchEvent) => {
    // Prevent default to avoid any browser handling that might interfere
    e.preventDefault()

    // Prevent double-firing by checking time since last tap
    const now = Date.now()
    if (now - lastTapTimeRef.time < 300) {
      return
    }
    lastTapTimeRef.time = now

    if (e.touches.length > 0) {
      const touch = e.touches[0]
      const cx = touch.clientX
      const cy = touch.clientY

      // Check if ship is close to the touch location
      if (ship.active && !ship.exploding) {
        const dx = ship.x - cx
        const dy = ship.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const explosionThreshold = 25 // Same as click handler
        const pushThreshold = 180 // Same as click handler

        if (dist < explosionThreshold) {
          // Ship is too close to touch burst, trigger explosion
          ship.exploding = true
          ship.explosionTime = Date.now()

          // Create explosion particles
          ship.explosionParticles = []

          // Create main burst particles - MORE particles and LARGER size
          const particleCount = 60 // Increased count
          for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2

            // Higher speed for larger explosion radius
            const speed = 0.5 + Math.random() * 1.8

            // Larger particles
            const sizeVariation = 0.8 + Math.random() * 0.7
            const baseSize = 2.0 + Math.random() * ship.size * 1.2 // Much larger particles

            ship.explosionParticles.push({
              x: ship.x,
              y: ship.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: baseSize * sizeVariation,
              alpha: 0.8 + Math.random() * 0.2,
              hue: 5 + Math.random() * 10
            })
          }

          // Create more central particles for a denser explosion
          for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 0.2 + Math.random() * 0.6 // Slower inner particles
            ship.explosionParticles.push({
              x: ship.x + (Math.random() * 4 - 2), // Small random offset
              y: ship.y + (Math.random() * 4 - 2), // Small random offset
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: 1.5 + Math.random() * ship.size * 0.5, // Larger inner particles
              alpha: 0.9,
              hue: 2 + Math.random() * 8
            })
          }

          // Add a small, faint ripple/burst effect
          // Simple ripples that expand outward
          for (let i = 0; i < 4; i++) {
            // Stagger the ripples slightly
            const delay = i * 50
            const initialSize = ship.size * (0.6 + i * 0.2)

            setTimeout(() => {
              if (ship.exploding) {
                // Only add if still exploding
                trails.push({
                  x: ship.x,
                  y: ship.y,
                  r: initialSize,
                  hue: 10 + Math.random() * 10,
                  alpha: 0.25 - i * 0.05, // Fainter for later ripples
                  ripple: true
                })
              }
            }, delay)
          }

          // Add immediate fire trails for initial burst
          for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2
            const distance = 2 + Math.random() * ship.size * 0.6
            trails.push({
              x: ship.x + Math.cos(angle) * distance,
              y: ship.y + Math.sin(angle) * distance,
              r: 1.2 + Math.random() * ship.size * 0.4,
              hue: 10,
              alpha: 0.8,
              ripple: false
            })
          }

          // Schedule respawn after explosion with longer delay and more randomness
          ship.active = false
          ship.respawnTime = Date.now() + 8000 + Math.random() * 15000
        } else if (dist < pushThreshold) {
          // Ship is close enough to be pushed but not explode

          // Calculate push direction (from touch to ship)
          const pushAngle = Math.atan2(dy, dx)

          // Calculate push strength based on distance (closer = stronger push)
          // AMPLIFIED push strength by increasing the base multiplier from 0.4 to 0.7
          const pushStrength = 0.7 * (1 - dist / pushThreshold)

          // AMPLIFIED position adjustment from 5 to 8
          ship.x += Math.cos(pushAngle) * pushStrength * 8
          ship.y += Math.sin(pushAngle) * pushStrength * 8

          // Gradually align ship's angle with the push direction
          let angleDiff = pushAngle - ship.angle

          // Handle angle wrap-around
          if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
          if (angleDiff < -Math.PI) angleDiff += Math.PI * 2

          // AMPLIFIED angle adjustment from 0.6 to 0.8
          ship.angle += angleDiff * pushStrength * 0.8

          // Keep angle in range [0, 2π]
          if (ship.angle > Math.PI * 2) ship.angle -= Math.PI * 2
          if (ship.angle < 0) ship.angle += Math.PI * 2

          // Add more dramatic visual trail to show the stronger push effect
          trails.push({
            x: ship.x,
            y: ship.y,
            r: 6, // Increased from 5
            hue: 200, // Blue push trail
            alpha: 0.7, // Increased from 0.5
            ripple: false
          })

          // Add a secondary trail effect for more dramatic push visual
          if (pushStrength > 0.3) {
            trails.push({
              x: ship.x - Math.cos(pushAngle) * 4,
              y: ship.y - Math.sin(pushAngle) * 4,
              r: 4,
              hue: 220,
              alpha: 0.5,
              ripple: false
            })
          }
        }
      }

      // Only set mouse position briefly for the push effect,
      // don't leave it for attraction
      for (let i = 0; i < asteroids.length; i++) {
        const a = asteroids[i]
        const dx = a.x - cx
        const dy = a.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const pushRadius = 200
        if (dist < pushRadius) {
          const strength = (1 - dist / pushRadius) * 0.65
          a.vx += dx * strength * 0.1
          a.vy += dy * strength * 0.1
        }
      }

      // Apply push effect to shooting stars for touch events
      for (let i = 0; i < shootingStars.length; i++) {
        const star = shootingStars[i]
        const dx = star.x - cx
        const dy = star.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const pushRadius = 200
        if (dist < pushRadius) {
          // Increased effect for shooting stars (about 1/2 of asteroid effect)
          const strength = (1 - dist / pushRadius) * 0.3
          star.vx += dx * strength * 0.04
          star.vy += dy * strength * 0.04
        }
      }

      // Create ripple effect
      trails.push({ x: cx, y: cy, r: 6.5, hue: 0, alpha: 0.3, ripple: true })

      // Set mouse position temporarily
      mouseRef.x = cx
      mouseRef.y = cy

      // Clear mouse position after a short delay (just enough for the push effect)
      setTimeout(() => {
        if (mouseRef.x === cx && mouseRef.y === cy) {
          mouseRef.x = null
          mouseRef.y = null
        }
      }, 50)
    }
  }

  const onTouchEnd = () => {
    // Clear mouse position when touch ends
    mouseRef.x = null
    mouseRef.y = null
  }

  const onTouchMove = (e: TouchEvent) => {
    // Prevent scrolling/zooming while interacting with canvas
    e.preventDefault()

    if (e.touches.length > 0) {
      const touch = e.touches[0]
      mouseRef.x = touch.clientX
      mouseRef.y = touch.clientY
    }
  }

  window.addEventListener('touchstart', onTouchStart, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
  window.addEventListener('touchcancel', onTouchEnd)
  window.addEventListener('touchmove', onTouchMove, { passive: false })

  // Add cleanup handler
  window.addEventListener('unload', () => {
    if (animationFrameRef) {
      cancelAnimationFrame(animationFrameRef)
    }
  })
})()
