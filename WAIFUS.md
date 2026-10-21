# Waifus Redragon

Ruby e Violet, as mascotes da Redragon, como companheiras de IA: corpo 3D, voz própria em português, chamada
por voz ("Hey Ruby", "Hey Violet") e importação de conversas do ChatGPT, Claude, Gemini e Grok para a memória.
Produto da Integraction.

## Como ela conversa

O app não leva chave de nenhum serviço. Na primeira abertura ele pede um código de acesso pessoal (`wr-` e 32
letras ou números) que a Integraction entrega. Com ele, a conversa, a voz (ElevenLabs) e o ouvido passam pela ponte
da Integraction, que guarda as chaves, limita o uso por dia e pode cancelar o código. Sem código, o app abre e dá
pra configurar outro provedor nas Configurações.

A chamada por voz ("Hey Ruby", "Hey Violet") roda no próprio aparelho: nenhum som sai antes da chamada.

## Base

Este repositório é o [AIRI](https://github.com/moeru-ai/airi) da Moeru AI no commit `747d4f6`, com as mudanças da
Integraction por cima. O código do AIRI e as mudanças no código seguem a licença MIT do arquivo `LICENSE`.

## O que não está na licença MIT

- **Personagens, nomes e arte**: Ruby, Violet, a arte e os modelos 3D
  (`packages/stage-ui/src/assets/vrm/models/Carmen`, `.../Violet`) pertencem à Redragon e à Integraction, com todos
  os direitos reservados. Não podem ser usados fora deste app sem autorização.
- **Vozes**: as vozes da Ruby e da Violet são da conta ElevenLabs da Integraction e só tocam pela ponte. As de
  reserva em `packages/stage-ui/src/workers/kokoro/voices/` são vozes do Kokoro-82M (Apache-2.0) e misturas delas.
- **Fonemas em português**: `@echogarden/espeak-ng-emscripten` (eSpeak NG, GPL-3.0).

## Compilar

Actions, workflow `waifus`, alvo `web`, `windows` ou `android`. Nada roda sozinho.
