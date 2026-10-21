// Prova do app num Windows de verdade (runner do GitHub): instala calado, abre, fotografa a tela e cada janela.
// Com WAIFUS_CODIGO no ambiente (segredo do repositório), também ativa com o código de teste, abre a conversa,
// manda uma mensagem, espera a resposta e testa a setinha da esquerda. O código nunca vai pro relato.
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
const CODIGO = (process.env.WAIFUS_CODIGO ?? '').trim()

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

const paginas = browser => browser.contexts().flatMap(c => c.pages())

/** Espera aparecer uma janela cujo endereço tem o trecho. */
async function achaPagina(browser, trecho, ms = 20000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const p = paginas(browser).find(x => x.url().includes(trecho))
    if (p)
      return p
    await espera(500)
  }
  return null
}

/** A tela de ativação: confere o fundo escuro, recusa um código inventado e aceita o de teste. */
async function ativar(browser) {
  const pag = await achaPagina(browser, '#/onboarding', 30000)
  if (!pag) {
    nota('ativação: a janela de boas-vindas não apareceu')
    return false
  }
  await pag.waitForSelector('#waifus-code', { timeout: 30000 })
  const tela = await pag.evaluate(() => ({
    fundo: getComputedStyle(document.querySelector('.activation')).backgroundColor,
    texto: document.querySelector('.activation').innerText.replace(/\s+/g, ' ').slice(0, 300),
  }))
  nota(`ativação: tela aberta, fundo ${tela.fundo}`)
  nota(`  texto: ${tela.texto}`)
  await pag.screenshot({ path: join(out, '10-ativar.png') })

  await pag.fill('#waifus-code', `wr-${'x'.repeat(32)}`)
  await pag.click('button[type=submit]')
  await pag.waitForFunction(() => /não reconheceu/.test(document.querySelector('#waifus-status')?.textContent ?? ''), null, { timeout: 20000 })
    .then(() => nota('ativação: código inventado recusado com aviso'), () => nota(`ativação: código inventado sem o aviso esperado (${pag.url()})`))
  await pag.screenshot({ path: join(out, '11-codigo-errado.png') })

  if (!CODIGO) {
    nota('ativação: sem WAIFUS_CODIGO no ambiente, parei aqui')
    return false
  }
  await pag.fill('#waifus-code', CODIGO)
  const t0 = Date.now()
  const fechou = pag.waitForEvent('close', { timeout: 40000 }).then(() => true, () => false)
  await pag.click('button[type=submit]')
  if (!await fechou) {
    nota(`ativação: a janela não fechou; aviso na tela: ${await pag.textContent('#waifus-status').catch(() => '?')}`)
    await pag.screenshot({ path: join(out, '12-ativar-falhou.png') }).catch(() => {})
    return false
  }
  nota(`ativação: código de teste aceito, a janela fechou em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  return true
}

/** Abre a conversa pelo botão do palco, manda uma pergunta e espera a resposta aparecer. */
async function conversar(browser) {
  const palco = paginas(browser).find(p => p.url().includes('synced-leader=true') && /#\/?$/.test(p.url()))
  if (!palco) {
    nota('conversa: não achei a janela do palco')
    return
  }
  const antes = new Set(paginas(browser))
  await palco.locator('[aria-label="Abrir a conversa"]').first().click({ force: true, timeout: 10000 })
    .catch(e => nota(`conversa: botão Abrir a conversa falhou (${e.message.split('\n')[0]})`))
  let chat = null
  for (let i = 0; i < 40 && !chat; i++) {
    chat = paginas(browser).find(p => !antes.has(p) || /#\/chat/.test(p.url()))
    if (!chat)
      await espera(500)
  }
  if (!chat) {
    nota('conversa: a janela da conversa não abriu')
    return
  }
  nota(`conversa: janela aberta (${chat.url().split('#')[1] ?? chat.url()})`)
  await chat.waitForSelector('textarea', { timeout: 20000 })
  const pergunta = 'Oi! Em uma frase curta: qual é o seu nome?'
  await chat.locator('textarea').first().fill(pergunta)
  await chat.locator('textarea').first().press('Enter')
  // A resposta chega aos pedaços: vale o texto depois da pergunta quando ele para de mudar por 3 s.
  const t0 = Date.now()
  const depoisDaPergunta = () => chat.evaluate((q) => {
    const texto = document.body.innerText
    const i = texto.lastIndexOf(q)
    return i < 0 ? '' : texto.slice(i + q.length).replace(/\s+/g, ' ').trim()
  }, pergunta).catch(() => '')
  const inicio = await depoisDaPergunta()
  let ultimo = inicio
  let parado = Date.now()
  while (Date.now() - t0 < 60000) {
    await espera(500)
    const agora = await depoisDaPergunta()
    if (agora !== ultimo) {
      ultimo = agora
      parado = Date.now()
    }
    else if (ultimo !== inicio && ultimo.length > 20 && Date.now() - parado > 3000) {
      break
    }
  }
  nota(ultimo !== inicio
    ? `conversa: resposta em ${((parado - t0) / 1000).toFixed(1)} s: ${ultimo.slice(0, 300)}`
    : `conversa: nada novo na tela em 60 s (texto depois da pergunta: ${inicio.slice(0, 200)})`)
  // tempo pra voz tocar
  await espera(8000)
  await chat.screenshot({ path: join(out, '13-conversa.png') }).catch(e => nota(`conversa: foto falhou (${e.message.split('\n')[0]})`))
  tela('14-area-de-trabalho-conversa.png')
}

/** Liga "Esconder na esquerda" nas Configurações e usa a setinha da borda: esconde, mostra, esconde de novo. */
async function esquerda(browser) {
  // Qualquer janela do app serve pra abrir as Configurações: o liga e desliga vale pra todas.
  const config = paginas(browser).find(p => /#\/chat/.test(p.url())) ?? paginas(browser).find(p => !p.url().includes('synced-leader=true'))
  if (!config) {
    nota('esquerda: não achei uma janela pra abrir as Configurações')
    return
  }
  await config.evaluate(() => { location.hash = '#/settings/system/general' })
  const campo = config.locator('label', { hasText: 'Esconder na esquerda' }).first()
  if (!await campo.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
    nota(`esquerda: a opção Esconder na esquerda não apareceu (${config.url()})`)
    await config.screenshot({ path: join(out, '15-config-sem-opcao.png') }).catch(() => {})
    return
  }
  await config.screenshot({ path: join(out, '15-config.png') })
  await campo.click()
  nota('esquerda: opção ligada nas Configurações')
  const aba = await achaPagina(browser, '#/edge-tab', 20000)
  if (!aba) {
    nota('esquerda: a setinha da borda não apareceu')
    return
  }
  const rotulo = () => aba.locator('button').first().getAttribute('aria-label').catch(() => '?')
  await espera(2500)
  nota(`esquerda: setinha na borda, diz "${await rotulo()}"`)
  tela('16-esquerda-escondida.png')
  await aba.screenshot({ path: join(out, '16-setinha.png') }).catch(() => {})
  await aba.locator('button').first().click()
  await espera(2500)
  nota(`esquerda: cliquei na setinha, agora diz "${await rotulo()}"`)
  tela('17-esquerda-apareceu.png')
  await aba.locator('button').first().click()
  await espera(2500)
  nota(`esquerda: cliquei de novo, agora diz "${await rotulo()}"`)
  tela('18-esquerda-escondida-de-novo.png')
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

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA}`)
  // Todo endereço de fora que as janelas pedem daqui pra frente: prova de que o app só fala com a nossa ponte.
  const destinos = new Map()
  const vigia = (page) => {
    if (page.__vigiada)
      return
    page.__vigiada = true
    page.on('request', (r) => {
      let host = ''
      try { host = new URL(r.url()).host }
      catch { return }
      if (!host || /^(127\.0\.0\.1|localhost)(:|$)/.test(host))
        return
      // Na ponte vale o pedido (conversa, voz, ouvido), não só o endereço.
      const ponte = r.url().match(/\/v1\/([^?]*)/)
      const chave = host === 'pm.solidpower.com.br' && ponte ? `${host} ${r.method()} ${ponte[1]}` : host
      destinos.set(chave, (destinos.get(chave) ?? 0) + 1)
    })
    // O console do Electron só escreve "[object DOMException]": aqui sai o nome e a mensagem do erro.
    page.on('console', async (m) => {
      if (m.type() !== 'error')
        return
      const partes = await Promise.all(m.args().map(a => a.evaluate(v => (v instanceof Error || v instanceof DOMException) ? `${v.name}: ${v.message}` : String(v)).catch(() => '?')))
      nota(`console: ${partes.join(' ').slice(0, 300)}`)
    })
  }
  for (const ctx of browser.contexts()) {
    ctx.pages().forEach(vigia)
    ctx.on('page', vigia)
  }
  if (await ativar(browser).catch((e) => { nota(`ativação: erro ${e.message.split('\n')[0]}`); return false })) {
    await espera(5000)
    tela('12-area-de-trabalho-ativado.png')
    await conversar(browser).catch(e => nota(`conversa: erro ${e.message.split('\n')[0]}`))
    await esquerda(browser).catch(e => nota(`esquerda: erro ${e.message.split('\n')[0]}`))
  }

  for (const ctx of browser.contexts())
    ctx.pages().forEach(vigia)
  nota(`endereços de fora pedidos pelas janelas: ${destinos.size ? [...destinos].map(([h, n]) => `${h} (${n})`).join(', ') : 'nenhum'}`)

  const alvos = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()
  for (const a of alvos)
    nota(`janela: ${a.type} · ${a.title} · ${a.url}`)

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
        // sem o fundo branco do print: mostra se a própria página é transparente atrás dela
        await page.screenshot({ path: join(out, `02-janela-${n}-alfa.png`), timeout: 15000, omitBackground: true })
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
