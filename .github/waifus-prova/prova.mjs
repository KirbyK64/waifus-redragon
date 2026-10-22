// Prova do app num Windows de verdade (runner do GitHub): instala calado, abre, fotografa a tela e cada janela.
// Confere que a primeira tela configura tudo sozinha (sem pedir código nem senha), abre a conversa, manda uma
// mensagem, espera a resposta e testa a setinha da esquerda. Depois faz o passeio de quem usa: conversa de várias
// perguntas com a Ruby, troca pra Violet, passa por toda tela de Configurações, mede memória e processador,
// fecha e abre de novo, e desinstala.
// uso: node prova.mjs <instalador.exe> <pasta-de-saida>
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { chromium } from 'playwright-core'

const [setup, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const relato = []
const nota = (s) => { console.log(s); relato.push(s) }
const espera = ms => new Promise(r => setTimeout(r, ms))
const PORTA = 9333
// NOTICE: o nome do exe vem do executableName do electron-builder (waifus-redragon.exe), não do productName
const NOME = /^waifus.*\.exe$/i
const ATALHOS = () => [join(process.env.USERPROFILE, 'Desktop'), join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'Desktop')].map(d => join(d, 'Waifus Redragon.lnk'))

// Toda tela de Configurações que existe no app (pastas de páginas do stage-pages e do stage-tamagotchi), mais o Sobre.
const ROTAS_CONFIG = [
  '/settings',
  '/settings/account',
  '/settings/airi-card',
  '/settings/airi-card/new',
  '/settings/connection',
  '/settings/data',
  '/settings/flux',
  '/settings/memory',
  '/settings/models',
  '/settings/modules',
  '/settings/modules/artistry',
  '/settings/modules/beat-sync',
  '/settings/modules/consciousness',
  '/settings/modules/gaming-factorio',
  '/settings/modules/gaming-minecraft',
  '/settings/modules/hearing',
  '/settings/modules/hearing/transcriber',
  '/settings/modules/hearing/voiceprint',
  '/settings/modules/hearing/wake-words',
  '/settings/modules/home-assistant',
  '/settings/modules/mcp',
  '/settings/modules/memory-long-term',
  '/settings/modules/memory-long-term-import',
  '/settings/modules/memory-long-term-memories',
  '/settings/modules/memory-long-term-recipes',
  '/settings/modules/memory-short-term',
  '/settings/modules/messaging-discord',
  '/settings/modules/speech',
  '/settings/modules/stickers',
  '/settings/modules/tool-cards',
  '/settings/modules/vision',
  '/settings/modules/web-search',
  '/settings/modules/x',
  '/settings/providers',
  '/settings/providers/artistry/comfyui',
  '/settings/providers/artistry/nanobanana',
  '/settings/providers/artistry/replicate',
  '/settings/providers/chat/amazon-bedrock',
  '/settings/providers/chat/azure-ai-foundry',
  '/settings/providers/chat/cloudflare-workers-ai',
  '/settings/providers/chat/lm-studio',
  '/settings/providers/chat/official-provider',
  '/settings/providers/chat/ollama',
  '/settings/providers/chat/prompt-api',
  '/settings/providers/speech/aivis-speech',
  '/settings/providers/speech/alibaba-cloud-model-studio',
  '/settings/providers/speech/app-local-audio-speech',
  '/settings/providers/speech/browser-local-audio-speech',
  '/settings/providers/speech/comet-api-speech',
  '/settings/providers/speech/deepgram-tts',
  '/settings/providers/speech/elevenlabs',
  '/settings/providers/speech/google-gemini-audio-speech',
  '/settings/providers/speech/index-tts-vllm',
  '/settings/providers/speech/kokoro-local',
  '/settings/providers/speech/microsoft-speech',
  '/settings/providers/speech/mimo-audio-speech',
  '/settings/providers/speech/minimax-speech',
  '/settings/providers/speech/official-provider-speech',
  '/settings/providers/speech/official-provider-speech-streaming',
  '/settings/providers/speech/openai-audio-speech',
  '/settings/providers/speech/openai-compatible-audio-speech',
  '/settings/providers/speech/openrouter-audio-speech',
  '/settings/providers/speech/player2-speech',
  '/settings/providers/speech/voicevox',
  '/settings/providers/speech/volcengine',
  '/settings/providers/transcription/aliyun-nls-transcription',
  '/settings/providers/transcription/app-local-audio-transcription',
  '/settings/providers/transcription/browser-local-audio-transcription',
  '/settings/providers/transcription/browser-web-speech-api',
  '/settings/providers/transcription/comet-api-transcription',
  '/settings/providers/transcription/mimo-audio-transcription',
  '/settings/providers/transcription/official-provider-transcription',
  '/settings/providers/transcription/openai-audio-transcription',
  '/settings/providers/transcription/openai-compatible-audio-transcription',
  '/settings/providers/vision/amazon-bedrock',
  '/settings/providers/vision/apple-vision',
  '/settings/providers/vision/azure-ai-foundry',
  '/settings/providers/vision/cloudflare-workers-ai',
  '/settings/providers/vision/lm-studio',
  '/settings/providers/vision/official-provider',
  '/settings/providers/vision/ollama',
  '/settings/scene',
  '/settings/system',
  '/settings/system/color-scheme',
  '/settings/system/developer',
  '/settings/system/experimental',
  '/settings/system/general',
  '/settings/system/window-shortcuts',
  '/about',
]

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

function tamanho(caminho) {
  let total = 0
  let st
  try { st = statSync(caminho) }
  catch { return 0 }
  if (!st.isDirectory())
    return st.size
  let nomes = []
  try { nomes = readdirSync(caminho) }
  catch { return 0 }
  for (const n of nomes)
    total += tamanho(join(caminho, n))
  return total
}
const mb = n => Math.round(n / 1048576)

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

/** Liga o app com a porta de depuração aberta e espera ela responder. */
async function liga(exe, arquivoLog) {
  const log = createWriteStream(join(out, arquivoLog))
  const t0 = Date.now()
  const app = spawn(exe, [`--remote-debugging-port=${PORTA}`], { env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  app.stdout.pipe(log); app.stderr.pipe(log)
  const estado = { app, saiu: null }
  app.on('exit', (c) => { estado.saiu = c })
  let pronto = false
  for (let i = 0; i < 90 && !pronto && estado.saiu === null; i++) {
    try { pronto = (await fetch(`http://127.0.0.1:${PORTA}/json/version`)).ok }
    catch {}
    if (!pronto)
      await espera(1000)
  }
  if (!pronto)
    throw new Error(`o app não abriu a porta de depuração (saiu com ${estado.saiu})`)
  estado.segundos = Math.round((Date.now() - t0) / 1000)
  return estado
}

/**
 * A primeira tela: tem que configurar tudo sozinha, sem pedir código nem senha e sem falar em Integraction.
 * Ela abre e fecha em segundos, então a prova procura por ela logo que o app abre a porta de depuração.
 */
async function primeiraTela(browser) {
  const pag = await achaPagina(browser, '#/onboarding', 30000)
  if (!pag) {
    nota('primeira tela: não vi (ou abriu e fechou antes de a prova olhar)')
    return
  }
  const t0 = Date.now()
  const fechou = pag.waitForEvent('close', { timeout: 40000 }).then(() => true, () => false)
  const tela = await pag.evaluate(() => {
    const raiz = document.querySelector('.activation') ?? document.body
    return {
      fundo: getComputedStyle(raiz).backgroundColor,
      texto: raiz.innerText.replace(/\s+/g, ' ').slice(0, 300),
      campos: document.querySelectorAll('input, textarea').length,
    }
  }).catch(() => null)
  if (tela) {
    nota(`primeira tela: aberta, fundo ${tela.fundo}, ${tela.campos} campo(s) pra digitar`)
    nota(`  texto: ${tela.texto}`)
    nota(`primeira tela: ${/integraction/i.test(tela.texto) ? 'FALA em Integraction' : 'sem Integraction'}; ${/c[óo]digo|senha/i.test(tela.texto) ? 'FALA em código ou senha' : 'sem pedir código nem senha'}`)
    await pag.screenshot({ path: join(out, '10-primeira-tela.png') }).catch(() => {})
  }
  if (!await fechou) {
    nota(`primeira tela: não fechou sozinha; aviso: ${await pag.textContent('#waifus-status').catch(() => '?')}`)
    await pag.screenshot({ path: join(out, '11-primeira-tela-parada.png') }).catch(() => {})
    return
  }
  nota(`primeira tela: configurou sozinha e fechou em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

/**
 * Manda uma pergunta na janela da conversa e espera a resposta parar de mudar.
 * A resposta chega aos pedaços: vale o texto depois da pergunta quando ele fica parado por 4 s.
 * O rótulo "Respondendo a Mensagem" do botão de responder também está na tela e não é a resposta.
 */
async function perguntar(chat, pergunta, ms = 60000) {
  await chat.locator('textarea').first().fill(pergunta)
  await chat.locator('textarea').first().press('Enter')
  const t0 = Date.now()
  const depoisDaPergunta = () => chat.evaluate((q) => {
    const texto = document.body.innerText
    const i = texto.lastIndexOf(q)
    return i < 0 ? '' : texto.slice(i + q.length).replace(/\s+/g, ' ').replace(/Respondendo a Mensagem/g, '').trim()
  }, pergunta).catch(() => '')
  const inicio = await depoisDaPergunta()
  let ultimo = inicio
  let parado = Date.now()
  while (Date.now() - t0 < ms) {
    await espera(500)
    const agora = await depoisDaPergunta()
    if (agora !== ultimo) {
      ultimo = agora
      parado = Date.now()
    }
    else if (ultimo !== inicio && ultimo.length > 0 && Date.now() - parado > 4000) {
      break
    }
  }
  return ultimo !== inicio ? { s: (parado - t0) / 1000, texto: ultimo } : null
}

/** Abre a conversa pelo botão do palco, manda uma pergunta e espera a resposta aparecer. Devolve a janela da conversa. */
async function conversar(browser) {
  const palco = paginas(browser).find(p => p.url().includes('synced-leader=true') && /#\/?$/.test(p.url()))
  if (!palco) {
    nota('conversa: não achei a janela do palco')
    return null
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
    return null
  }
  nota(`conversa: janela aberta (${chat.url().split('#')[1] ?? chat.url()})`)
  await chat.waitForSelector('textarea', { timeout: 20000 })
  const pergunta = 'Oi! Em uma frase curta: qual é o seu nome?'
  const r = await perguntar(chat, pergunta)
  nota(r
    ? `conversa: resposta em ${r.s.toFixed(1)} s: ${r.texto.slice(0, 300)}`
    : 'conversa: nada novo na tela em 60 s')
  // tempo pra voz tocar
  await espera(8000)
  await chat.screenshot({ path: join(out, '13-conversa.png') }).catch(e => nota(`conversa: foto falhou (${e.message.split('\n')[0]})`))
  tela('14-area-de-trabalho-conversa.png')
  return chat
}

/** Várias perguntas seguidas na mesma conversa, como quem usa de verdade: o tempo e a resposta de cada uma. */
async function papo(chat, rotulo, perguntas) {
  let n = 0
  for (const q of perguntas) {
    n++
    const r = await perguntar(chat, q).catch(e => nota(`${rotulo} ${n}: erro ${e.message.split('\n')[0]}`))
    nota(r ? `${rotulo} ${n}: ${r.s.toFixed(1)} s · P: ${q} · R: ${r.texto.slice(0, 500)}` : `${rotulo} ${n}: sem resposta em 60 s · P: ${q}`)
    // a fala da resposta antes da próxima pergunta
    await espera(6000)
  }
  await chat.screenshot({ path: join(out, `20-${rotulo}.png`) }).catch(() => {})
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
  // A Ruby volta pra área de trabalho pro resto do passeio.
  await aba.locator('button').first().click()
  await config.evaluate(() => { location.hash = '#/settings/system/general' })
  await campo.click().catch(() => {})
  await espera(2500)
  nota(`esquerda: desliguei de novo pro passeio (${paginas(browser).some(p => p.url().includes('#/edge-tab')) ? 'setinha ainda na borda' : 'setinha saiu'})`)
}

/** Troca pra Violet pelo cartão dela nas Configurações, como quem usa faria, e conversa com ela. */
async function violet(chat, rotaChat) {
  await chat.evaluate(() => { location.hash = '#/settings/airi-card/redragon-violet' })
  const botao = chat.getByRole('button', { name: /^Ativar$/ }).first()
  if (!await botao.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
    nota('violet: o botão Ativar do cartão dela não apareceu')
    await chat.screenshot({ path: join(out, '21-cartao-violet-sem-botao.png') }).catch(() => {})
    return
  }
  await chat.screenshot({ path: join(out, '21-cartao-violet.png') }).catch(() => {})
  const t0 = Date.now()
  await botao.click()
  await espera(15000)
  nota(`violet: ativei pelo cartão; ${((Date.now() - t0) / 1000).toFixed(0)} s depois a foto da área de trabalho`)
  tela('22-violet-na-area-de-trabalho.png')
  await chat.evaluate((r) => { location.hash = `#${r}` }, rotaChat)
  await chat.waitForSelector('textarea', { timeout: 20000 })
  await espera(2000)
  nota(`violet: topo da conversa depois da troca: ${(await chat.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`)
  await papo(chat, 'violet', [
    'Oi! Quem é você, em uma frase?',
    'Perdi de novo no Valorant. Me zoa um pouco, mas me dá uma dica.',
  ])
  tela('23-violet-conversa.png')
}

/**
 * Passa por toda tela de Configurações no tamanho da janela de Configurações (600 x 800) e anota o que uma pessoa
 * de fora veria: texto em inglês, nome do AIRI ou da Integraction, letras chinesas ou japonesas, link pra fora e
 * campo pedindo chave.
 */
async function passeioConfig(page) {
  await page.setViewportSize({ width: 600, height: 800 }).catch(() => {})
  const INGLES = /\b(?:the|your|you|and|with|this|that|of|for|is|are|be|will|from|when|which|not|to|in|on|by|or|an|can|use)\b/gi
  const vistas = []
  let n = 0
  for (const rota of ROTAS_CONFIG) {
    n++
    await page.evaluate((r) => { location.hash = `#${r}` }, rota).catch(() => {})
    await espera(1800)
    const info = await page.evaluate(() => {
      const visivel = el => el.offsetParent !== null
      return {
        rota: location.hash.slice(1),
        texto: document.body.innerText,
        externos: [...document.querySelectorAll('a[href^="http"]')].filter(visivel).map(a => a.href),
        campos: [...document.querySelectorAll('input, textarea')].filter(i => i.type !== 'hidden' && i.type !== 'checkbox' && i.type !== 'radio' && i.type !== 'range' && visivel(i))
          .map(i => i.placeholder || i.getAttribute('aria-label') || i.name || i.type),
        links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /settings/.test(h)),
      }
    }).catch(e => ({ erro: e.message.split('\n')[0] }))
    if (info.erro) {
      vistas.push({ rota, erro: info.erro })
      continue
    }
    const linhas = info.texto.split('\n').map(l => l.trim()).filter(Boolean)
    const ingles = linhas.filter(l => l.length > 12 && (l.match(INGLES) ?? []).length >= 2)
    const marcas = [...new Set((info.texto.match(/\bAIRI\b|moeru|integraction|\bReLU\b|Neuro-?sama/gi) ?? []).map(m => m.toLowerCase()))]
    const cjk = (info.texto.match(/[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g) ?? []).length
    const chave = info.campos.filter(c => /api|key|chave|token|secret|senha/i.test(c))
    const foto = `30-config-${String(n).padStart(2, '0')}-${rota.replace(/^\//, '').replace(/\//g, '_')}.jpg`
    await page.screenshot({ path: join(out, foto), type: 'jpeg', quality: 55 }).catch(() => {})
    vistas.push({ rota, chegou: info.rota, titulo: linhas.slice(0, 3).join(' · ').slice(0, 120), linhas: linhas.length, ingles: ingles.slice(0, 6), nIngles: ingles.length, marcas, cjk, externos: [...new Set(info.externos)], campos: info.campos, chave, links: [...new Set(info.links)], foto })
  }
  writeFileSync(join(out, 'passeio-config.json'), `${JSON.stringify(vistas, null, 2)}\n`)
  const com = f => vistas.filter(f)
  nota(`config: ${vistas.length} telas visitadas`)
  nota(`config: com texto em inglês: ${com(v => v.nIngles).length} (${com(v => v.nIngles).map(v => `${v.rota} ${v.nIngles}`).join(', ')})`)
  nota(`config: com nome de outra marca: ${com(v => v.marcas?.length).map(v => `${v.rota} [${v.marcas.join(' ')}]`).join(', ') || 'nenhuma'}`)
  nota(`config: com letra chinesa, japonesa ou coreana: ${com(v => v.cjk).map(v => `${v.rota} ${v.cjk}`).join(', ') || 'nenhuma'}`)
  nota(`config: com link pra fora: ${com(v => v.externos?.length).map(v => `${v.rota} (${v.externos.map(u => new URL(u).host).join(' ')})`).join(', ') || 'nenhuma'}`)
  nota(`config: pedindo chave ou senha: ${com(v => v.chave?.length).length} (${com(v => v.chave?.length).map(v => v.rota).join(', ')})`)
  nota(`config: não abriram: ${com(v => v.erro || (v.chegou && v.chegou !== v.rota)).map(v => `${v.rota}${v.chegou ? ` foi pra ${v.chegou}` : ` (${v.erro})`}`).join(', ') || 'nenhuma'}`)
}

/** Memória e processador do app parado com a personagem na tela (soma de todos os processos dele). */
function recursos(rotulo) {
  const ps = [
    '$f = { Get-Process | Where-Object { $_.ProcessName -match \'waifus|godot\' } }',
    '$a = (& $f | Measure-Object CPU -Sum).Sum',
    'Start-Sleep -Seconds 15',
    '$p = & $f',
    '$b = ($p | Measure-Object CPU -Sum).Sum',
    '$m = ($p | Measure-Object WorkingSet64 -Sum).Sum',
    '$c = [Environment]::ProcessorCount',
    // NOTICE: só número na saída; acento sai na página de código do console e chega torto aqui.
    '"{0} {1} {2} {3}" -f $p.Count, [math]::Round($m / 1MB), [math]::Round(($b - $a) / 15 * 100 / $c, 1), $c',
  ].join('; ')
  try {
    const [qtos, mem, cpu, nucleos] = execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().trim().split(/\s+/)
    nota(`recursos ${rotulo}: ${qtos} processos, ${mem} MB de memória, ${cpu}% do processador (${nucleos} núcleos)`)
  }
  catch (e) { nota(`recursos ${rotulo}: falhou (${e.message.split('\n')[0]})`) }
}

/** Fecha tudo e abre de novo: tem que voltar configurado, sem a primeira tela, e com a conversa de antes. */
async function reabrir(exe, marcas) {
  spawnSync('taskkill', ['/IM', exe.split('\\').pop(), '/F', '/T'], { stdio: 'ignore' })
  await espera(5000)
  const estado = await liga(exe, 'app-2.log')
  nota(`reabrir: abriu em ${estado.segundos} s`)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA}`)
  const onb = await achaPagina(browser, '#/onboarding', 8000)
  nota(`reabrir: primeira tela ${onb ? 'APARECEU de novo' : 'não apareceu'}`)
  await espera(15000)
  tela('40-reaberto.png')
  const palco = paginas(browser).find(p => p.url().includes('synced-leader=true') && /#\/?$/.test(p.url()))
  const antes = new Set(paginas(browser))
  await palco?.locator('[aria-label="Abrir a conversa"]').first().click({ force: true, timeout: 10000 }).catch(() => {})
  let chat = null
  for (let i = 0; i < 40 && !chat; i++) {
    chat = paginas(browser).find(p => !antes.has(p) || /#\/chat/.test(p.url()))
    if (!chat)
      await espera(500)
  }
  if (chat) {
    await chat.waitForSelector('textarea', { timeout: 20000 }).catch(() => {})
    await espera(2000)
    const texto = (await chat.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ')
    const achou = marcas.filter(m => texto.includes(m))
    nota(`reabrir: na conversa, ${achou.length ? `a conversa de antes está lá ("${achou.join('", "')}")` : 'a conversa de antes NÃO está'}; topo: ${texto.slice(0, 160)}`)
    await chat.screenshot({ path: join(out, '41-reaberto-conversa.png') }).catch(() => {})
    await papo(chat, 'reaberto', ['Voltei! Lembra o meu nome?'])
  }
  else {
    nota('reabrir: a janela da conversa não abriu')
  }
  recursos('depois de reabrir')
  await browser.close().catch(() => {})
  spawnSync('taskkill', ['/IM', exe.split('\\').pop(), '/F', '/T'], { stdio: 'ignore' })
  await espera(4000)
}

/** Desinstala calado: o app e o atalho têm que sair. Anota o que fica (as conversas e configurações da pessoa). */
async function desinstalar(exe) {
  const pasta = dirname(exe)
  nota(`instalado: ${mb(tamanho(pasta))} MB em disco`)
  const un = readdirSync(pasta).find(f => /^uninstall.*\.exe$/i.test(f))
  if (!un) {
    nota('desinstalar: não achei o desinstalador')
    return
  }
  const t0 = Date.now()
  spawnSync(join(pasta, un), ['/S'], { stdio: 'inherit' })
  // O desinstalador do NSIS se copia pra pasta temporária e volta na hora: vale quando o app some do disco.
  for (let i = 0; i < 90 && existsSync(exe); i++)
    await espera(1000)
  nota(`desinstalar: ${existsSync(exe) ? 'o app FICOU no disco' : 'o app saiu'} em ${Math.round((Date.now() - t0) / 1000)} s; atalho ${ATALHOS().some(a => existsSync(a)) ? 'FICOU' : 'saiu'}`)
  for (const raiz of [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean)) {
    let nomes = []
    try { nomes = readdirSync(raiz) }
    catch { continue }
    for (const n of nomes.filter(n => /waifus|airi/i.test(n)))
      nota(`desinstalar: ficou ${join(raiz, n)} (${mb(tamanho(join(raiz, n)))} MB)`)
  }
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
  nota(`atalho na área de trabalho: ${ATALHOS().some(a => existsSync(a)) ? 'sim' : 'não'}`)

  t0 = Date.now()
  const estado = await liga(exe, 'app.log')
  nota(`app abriu em ${estado.segundos} s`)

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA}`)
  // Todo endereço de fora que as janelas pedem daqui pra frente: prova de que o app só fala com a nossa ponte.
  const destinos = new Map()
  // Quanto cada pedido à ponte levou, do pedido ao último byte (a conversa chega aos pedaços).
  const tempos = new Map()
  let vozes = 0
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
    page.on('requestfinished', async (r) => {
      const m = r.url().match(/pm\.solidpower\.com\.br\/.*\/v1\/(chat\/completions|audio\/speech|audio\/transcriptions)/)
      if (!m || r.method() !== 'POST')
        return
      const t = r.timing()
      tempos.set(m[1], [...(tempos.get(m[1]) ?? []), Math.round(t.responseEnd)])
      // As primeiras falas vão pra pasta: a duração e o som se conferem fora daqui.
      if (m[1] === 'audio/speech' && vozes < 6) {
        const n = ++vozes
        const corpo = await r.response().then(x => x?.body()).catch(() => null)
        if (corpo)
          writeFileSync(join(out, `voz-${n}.mp3`), corpo)
      }
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
  await primeiraTela(browser).catch(e => nota(`primeira tela: erro ${e.message.split('\n')[0]}`))

  // tempo pra carregar o corpo 3D e a voz
  await espera(20000)
  nota(`app ainda rodando depois de 20 s: ${estado.saiu === null ? 'sim' : `não (saiu com ${estado.saiu})`}`)
  tela('12-area-de-trabalho-ativado.png')
  recursos('parado com a Ruby na tela')
  const chat = await conversar(browser).catch(e => nota(`conversa: erro ${e.message.split('\n')[0]}`))
  const rotaChat = chat ? (chat.url().split('#')[1] ?? '/chat') : '/chat'
  if (chat) {
    await papo(chat, 'ruby', [
      'Meu nome é Gui e eu jogo Valorant. Guarda isso, tá?',
      'Qual teclado da Redragon você me indica pra jogar FPS?',
      'Quanto ele custa e tem em estoque?',
      'Qual é o meu nome e o que eu jogo?',
      'Me conta uma piada curta de gamer.',
      'Quem é a Violet?',
      'Tô bem chateado, perdi cinco partidas seguidas.',
    ]).catch(e => nota(`ruby: erro ${e.message.split('\n')[0]}`))
    tela('19-ruby-conversa.png')
  }
  await esquerda(browser).catch(e => nota(`esquerda: erro ${e.message.split('\n')[0]}`))
  if (chat) {
    await violet(chat, rotaChat).catch(e => nota(`violet: erro ${e.message.split('\n')[0]}`))
    await passeioConfig(chat).catch(e => nota(`config: erro ${e.message.split('\n')[0]}`))
    await chat.evaluate((r) => { location.hash = `#${r}` }, rotaChat).catch(() => {})
  }

  for (const ctx of browser.contexts())
    ctx.pages().forEach(vigia)
  nota(`endereços de fora pedidos pelas janelas: ${destinos.size ? [...destinos].map(([h, n]) => `${h} (${n})`).join(', ') : 'nenhum'}`)
  for (const [tipo, ms] of tempos)
    nota(`ponte ${tipo}: ${ms.length} pedidos, ${ms.join(' ')} ms`)

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
        if (/integraction/i.test(`${info.titulo} ${info.texto}`))
          nota(`  página ${n} FALA em Integraction`)
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
  recursos('no fim do passeio')
  await browser.close().catch(() => {})

  await reabrir(exe, ['Tô bem chateado', 'Perdi de novo no Valorant']).catch(e => nota(`reabrir: erro ${e.message.split('\n')[0]}`))
  await desinstalar(exe).catch(e => nota(`desinstalar: erro ${e.message.split('\n')[0]}`))
}

try { await main() }
catch (e) { nota(`FALHOU: ${e.message}`); process.exitCode = 1 }
finally {
  for (const arq of ['app.log', 'app-2.log']) {
    try {
      const l = readFileSync(join(out, arq), 'utf8').split('\n')
      const ruins = l.filter(x => /error|fatal|crash|exception/i.test(x))
      nota(`log ${arq}: ${l.length} linhas, ${ruins.length} com erro`)
      for (const x of ruins.slice(0, 30))
        nota(`  ${x.slice(0, 300)}`)
    }
    catch {}
  }
  writeFileSync(join(out, 'relato.txt'), `${relato.join('\n')}\n`)
}
