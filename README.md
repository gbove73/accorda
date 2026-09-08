# Accorda

Accordatore cromatico professionale eseguito interamente nel browser. Il microfono
non viene registrato né inviato a un server: Web Audio API e rilevamento della nota
operano sul dispositivo dell'utente.

[Prova Accorda online](https://accorda.gianlucab.chatgpt.site/)

## Funzioni principali

- rilevamento ibrido YIN con verifica armonica e correzione degli errori di ottava;
- interpolazione sub-campione, filtro mediano ed EMA in dominio musicale;
- zona di precisione monofonica centrata a ±1 cent, con validazione numerica
  deterministica sull'intero registro della chitarra e su scostamenti frazionali;
- modalità polifonica per controllare tutte le corde aperte con una sola pennata,
  affiancata alla modalità di precisione monofonica e con una pratica zona verde
  entro ±2 cent;
- passaggio grafico automatico tra griglia polifonica e ago quando il segnale cambia
  da più corde a una sola, con isteresi contro le commutazioni instabili;
- analisi multi-pitch FFT a 32.768 campioni, consenso fra parziali e riconoscimento
  delle sovrapposizioni armoniche fra corde;
- indicatore a lancetta, stroboscopio e cronologia dell'intonazione;
- riconoscimento automatico delle corde con controllo progressivo dell'accordatura;
- preset per chitarra, basso, ukulele, violino e mandolino;
- calibrazione A4 da 415 a 466 Hz e generatore di toni di riferimento;
- interfaccia responsive, accessibile da tastiera e rispettosa del movimento ridotto.

La precisione di ±1 cent è un obiettivo operativo misurato con segnale stabile. Il
risultato reale dipende anche dal microfono, dal rumore ambientale, dall'attacco e
dalla stabilità dello strumento. La vista polifonica offre un controllo immediato
dell'insieme; la modalità monofonica resta il riferimento per la regolazione finale.

## Sviluppo

```bash
npm install
npm run dev
```

## Verifica

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Licenza

Accorda è software open source distribuito con licenza [MIT](LICENSE). Puoi usarlo,
studiarlo, modificarlo e distribuirlo, mantenendo l'avviso di copyright e la licenza.
