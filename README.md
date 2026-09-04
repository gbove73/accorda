# Aurelia Tuner

Accordatore cromatico professionale eseguito interamente nel browser. Il microfono
non viene registrato né inviato a un server: Web Audio API e rilevamento della nota
operano sul dispositivo dell'utente.

## Funzioni principali

- rilevamento ibrido YIN con verifica armonica e correzione degli errori di ottava;
- interpolazione sub-campione, filtro mediano ed EMA in dominio musicale;
- indicatore a lancetta, stroboscopio e cronologia dell'intonazione;
- riconoscimento automatico delle corde con controllo progressivo dell'accordatura;
- preset per chitarra, basso, ukulele, violino e mandolino;
- calibrazione A4 da 415 a 466 Hz e generatore di toni di riferimento;
- interfaccia responsive, accessibile da tastiera e rispettosa del movimento ridotto.

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
