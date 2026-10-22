# Waifus Redragon

Ruby e Violet, as mascotes da Redragon, como companheiras de IA: corpo 3D, voz própria em português, chamada
por voz ("Hey Ruby", "Hey Violet") e importação de conversas do ChatGPT, Claude, Gemini e Grok para a memória.

## Como ela conversa

Instalou, abriu, ela conversa: o app não pede código, senha nem conta. Ele não leva chave de nenhum serviço: a
conversa, a voz (ElevenLabs) e o ouvido passam pela nossa ponte, que guarda as chaves e limita o uso por dia.

A chamada por voz ("Hey Ruby", "Hey Violet") roda no próprio aparelho: nenhum som sai antes da chamada.

## Base

Este repositório é o [AIRI](https://github.com/moeru-ai/airi) da Moeru AI no commit `747d4f6`, com as mudanças das
Waifus Redragon por cima. O código do AIRI e as mudanças no código seguem a licença MIT do arquivo `LICENSE`. O
README original do AIRI está em [`docs/README.airi.md`](docs/README.airi.md).

## O que não está na licença MIT

- **Personagens, nomes e arte**: Ruby, Violet, a arte e os modelos 3D
  (`packages/stage-ui/src/assets/vrm/models/Carmen`, `.../Violet`) pertencem à Redragon, com todos os direitos
  reservados. Não podem ser usados fora deste app sem autorização.
- **Vozes**: as vozes da Ruby e da Violet são da nossa conta na ElevenLabs e só tocam pela ponte. As de reserva em
  `packages/stage-ui/src/workers/kokoro/voices/` são vozes do Kokoro-82M (Apache-2.0) e misturas delas.
- **Fonemas em português**: `@echogarden/espeak-ng-emscripten` (eSpeak NG, GPL-3.0).

## Compilar

Actions, workflow `waifus`, alvo `web`, `windows` ou `android`. Nada roda sozinho.
