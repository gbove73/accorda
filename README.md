# Aurelia Tuner

Accordatore cromatico professionale eseguito interamente nel browser. Il microfono
non viene registrato né inviato a un server: Web Audio API e rilevamento della nota
operano sul dispositivo dell'utente.

## Funzioni principali

- rilevamento ibrido YIN con verifica armonica e correzione degli errori di ottava;
- interpolazione sub-campione, filtro mediano ed EMA in dominio musicale;
- zona di accordatura centrata a ±1 cent, con validazione numerica deterministica
  sull'intero registro della chitarra e su scostamenti frazionali;
- indicatore a lancetta, stroboscopio e cronologia dell'intonazione;
- riconoscimento automatico delle corde con controllo progressivo dell'accordatura;
- preset per chitarra, basso, ukulele, violino e mandolino;
- calibrazione A4 da 415 a 466 Hz e generatore di toni di riferimento;
- interfaccia responsive, accessibile da tastiera e rispettosa del movimento ridotto.

La precisione di ±1 cent è un obiettivo operativo misurato con segnale stabile. Il
risultato reale dipende anche dal microfono, dal rumore ambientale, dall'attacco e
dalla stabilità dello strumento.

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
