# Waifus Redragon

Carmen e Violet, as mascotes da Redragon, como companheiras de IA: corpo 3D, voz em português que roda no
próprio aparelho, chamada por voz ("Hey Carmen", "Hey Violet") e importação de conversas do ChatGPT, Claude,
Gemini e Grok para a memória. Produto da Integraction.

## Base

Este repositório é o [AIRI](https://github.com/moeru-ai/airi) da Moeru AI no commit `747d4f6`, com as mudanças da
Integraction por cima. O código do AIRI e as mudanças no código seguem a licença MIT do arquivo `LICENSE`.

## O que não está na licença MIT

- **Personagens, nomes e arte**: Carmen, Violet, a arte e os modelos 3D
  (`packages/stage-ui/src/assets/vrm/models/Carmen`, `.../Violet`) pertencem à Redragon e à Integraction, com todos
  os direitos reservados. Não podem ser usados fora deste app sem autorização.
- **Vozes**: `packages/stage-ui/src/workers/kokoro/voices/` são vozes do Kokoro-82M (Apache-2.0) e misturas delas.
- **Fonemas em português**: `@echogarden/espeak-ng-emscripten` (eSpeak NG, GPL-3.0).

## Compilar

Actions, workflow `waifus`, alvo `web`, `windows` ou `android`. Nada roda sozinho.
