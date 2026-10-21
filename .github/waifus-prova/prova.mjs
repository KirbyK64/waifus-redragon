// Prova do app num Windows de verdade (runner do GitHub): instala calado, abre, fotografa a tela e cada janela.
// uso: node prova.mjs <instalador.exe> <pasta-de-saida>
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from 'playwright-core'

const [setup, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const relato = []
const nota = (s) => { console.log(s); relato.push(s) }
const espera = ms => new Promise(r => setTimeout(r, ms))
const PORTA = 9333
// NOTICE: o nome do exe vem do executableName do electron-builder (waifus-redragon.exe), não do productName
const NOME = /^waifus.*\.exe$/i

function tela(nome) {
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'tela.ps1'), join(out, nome)])
    nota(`foto: ${nome}`)
  }
  catch (e) { nota(`foto ${nome} falhou: ${e.message}`) }
}

/** O instalador põe o app numa pasta com o nome dele: na do usuário (por pessoa) ou em Arquivos de Programas (calado como admin). */
function acha() {
  const pastas = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
  for (const raiz of pastas.filter(Boolean)) {
    let nomes = []
    try { nomes = readdirSync(raiz) }
    catch { continue }
    for (const n of nomes.filter(n => /waifus/i.test(n))) {
      let dentro = []
      try { dentro = readdirSync(join(raiz, n)) }
      catch { continue }
      nota(`pasta ${join(raiz, n)}: ${dentro.join(', ')}`)
      const exe = dentro.find(f => NOME.test(f))
      if (exe)
        return join(raiz, n, exe)
    }
  }
  return null
}

async function main() {
  tela('00-antes.png')

  let t0 = Date.now()
  const inst = spawnSync(setup, ['/S'], { stdio: 'inherit' })
  nota(`instalador /S: saiu com ${inst.status} em ${Math.round((Date.now() - t0) / 1000)} s`)
  const exe = acha()
  if (!exe)
    throw new Error('não achei o exe do app depois de instalar')
  spawnSync('taskkill', ['/IM', exe.split('\\').pop(), '/F'], { stdio: 'ignore' })
  nota(`instalado em: ${exe}`)
  const atalhos = [join(process.env.USERPROFILE, 'Desktop'), join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'Desktop')].map(d => join(d, 'Waifus Redragon.lnk'))
  nota(`atalho na área de trabalho: ${atalhos.some(a => existsSync(a)) ? 'sim' : 'não'}`)

  const log = createWriteStream(join(out, 'app.log'))
  t0 = Date.now()
  const app = spawn(exe, [`--remote-debugging-port=${PORTA}`], { env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  app.stdout.pipe(log); app.stderr.pipe(log)
  let saiu = null
  app.on('exit', (c) => { saiu = c })

  let pronto = false
  for (let i = 0; i < 90 && !pronto && saiu === null; i++) {
    try { pronto = (await fetch(`http://127.0.0.1:${PORTA}/json/version`)).ok }
    catch {}
    if (!pronto)
      await espera(1000)
  }
  if (!pronto)
    throw new Error(`o app não abriu a porta de depuração (saiu com ${saiu})`)
  nota(`app abriu em ${Math.round((Date.now() - t0) / 1000)} s`)

  // tempo pra carregar o corpo 3D e a voz
  await espera(25000)
  nota(`app ainda rodando depois de 25 s: ${saiu === null ? 'sim' : `não (saiu com ${saiu})`}`)
  tela('01-area-de-trabalho.png')

  const alvos = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()
  for (const a of alvos)
    nota(`janela: ${a.type} · ${a.title} · ${a.url}`)

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA}`)
  const erros = []
  let n = 0
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages()) {
      n++
      page.on('console', (m) => { if (m.type() === 'error') erros.push(`${page.url()}: ${m.text()}`) })
      const url = page.url()
      try {
        const info = await page.evaluate(() => {
          const c = document.createElement('canvas')
          const gl = c.getContext('webgl2') || c.getContext('webgl')
          const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
          return {
            titulo: document.title,
            canvas: document.querySelectorAll('canvas').length,
            gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? 'webgl sem info' : 'sem webgl'),
            webgpu: 'gpu' in navigator,
            texto: document.body ? document.body.innerText.slice(0, 300).replace(/\s+/g, ' ') : '',
          }
        })
        nota(`página ${n}: ${url} · título "${info.titulo}" · ${info.canvas} canvas · GPU ${info.gpu} · WebGPU ${info.webgpu}`)
        nota(`  texto: ${info.texto}`)
      }
      catch (e) { nota(`página ${n}: ${url} · não li (${e.message.split('\n')[0]})`) }
      try {
        await page.screenshot({ path: join(out, `02-janela-${n}.png`), timeout: 15000 })
        nota(`  foto: 02-janela-${n}.png`)
      }
      catch (e) { nota(`  foto da janela ${n} falhou: ${e.message.split('\n')[0]}`) }
    }
  }
  await espera(5000)
  tela('03-depois.png')
  nota(`erros no console enquanto olhava: ${erros.length}`)
  for (const e of erros.slice(0, 20))
    nota(`  ${e}`)
  await browser.close().catch(() => {})
  app.kill()
}

try { await main() }
catch (e) { nota(`FALHOU: ${e.message}`); process.exitCode = 1 }
finally {
  try {
    const l = readFileSync(join(out, 'app.log'), 'utf8').split('\n')
    const ruins = l.filter(x => /error|fatal|crash|exception/i.test(x))
    nota(`log do app: ${l.length} linhas, ${ruins.length} com erro`)
    for (const x of ruins.slice(0, 30))
      nota(`  ${x.slice(0, 300)}`)
  }
  catch {}
  writeFileSync(join(out, 'relato.txt'), `${relato.join('\n')}\n`)
}
