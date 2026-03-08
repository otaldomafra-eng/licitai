# Relatorio de Cobertura Conversacional

- Total de cenarios: **27**
- Sucesso: **27**
- Falhas: **0**

## Cobertura por intencao

- consulta: 21 cenarios
- duvida: 6 cenarios

## Cobertura por categoria

- clarificacao-base: 8 cenarios
- perfil: 2 cenarios
- ambiguidades: 3 cenarios
- contradicao: 2 cenarios
- mudanca-assunto: 4 cenarios
- spam-comandos: 2 cenarios
- ruido: 3 cenarios
- vaguidade: 3 cenarios

## Resultados

| ID | Categoria | Intencao | Status | Detalhe |
|---|---|---|---|---|
| S1 | clarificacao-base | consulta | PASS | clarificacao |
| S2 | clarificacao-base | consulta | PASS | sem_clarificacao |
| S3 | clarificacao-base | duvida | PASS | clarificacao |
| S4 | clarificacao-base | duvida | PASS | clarificacao |
| S5 | clarificacao-base | duvida | PASS | sem_clarificacao |
| S6 | clarificacao-base | consulta | PASS | clarificacao |
| S7 | clarificacao-base | consulta | PASS | sem_clarificacao |
| S8 | clarificacao-base | consulta | PASS | sem_clarificacao |
| M1 | ambiguidades | consulta | PASS | reprompt_keep |
| M2 | ambiguidades | consulta | PASS | reprompt_clear |
| M3 | ambiguidades | consulta | PASS | resolve |
| M4 | mudanca-assunto | consulta | PASS | bypass_clear |
| M5 | mudanca-assunto | consulta | PASS | bypass_clear |
| M6 | mudanca-assunto | duvida | PASS | bypass_clear |
| M9 | mudanca-assunto | consulta | PASS | bypass_clear |
| M7 | contradicao | consulta | PASS | reprompt_keep |
| M8 | contradicao | consulta | PASS | reprompt_keep |
| R1 | ruido | consulta | PASS | reprompt_keep |
| R2 | ruido | consulta | PASS | reprompt_keep |
| R3 | ruido | consulta | PASS | reprompt_keep |
| V1 | vaguidade | consulta | PASS | reprompt_keep |
| V2 | vaguidade | consulta | PASS | reprompt_keep |
| V3 | vaguidade | consulta | PASS | reprompt_clear |
| Q1 | spam-comandos | consulta | PASS | bypass_clear x10 |
| Q2 | spam-comandos | consulta | PASS | reprompt_clear |
| P1 | perfil | duvida | PASS | perfil_direto |
| P2 | perfil | duvida | PASS | perfil_consultivo |

## Escopo de stress

- mensagens longas e objetivas
- troca brusca de assunto durante clarificacao
- spam/comandos globais durante pendencia (10+ comandos)
- multiplos comandos na mesma mensagem
- ambiguidades sucessivas e resposta fraca repetida
- respostas contraditorias durante clarificacao
- ruido textual (repeticao, pontuacao extrema, caracteres repetidos)
- respostas vagas/genericas (ex.: "tanto faz", "qualquer edital")