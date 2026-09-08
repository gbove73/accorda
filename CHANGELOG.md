# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il
progetto adotta [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Added

- Pubblicazione del codice sorgente con licenza open source MIT, metadati GitHub e
  collegamento alla demo online.
- Prima versione di Accorda con rilevamento cromatico ibrido YIN, verifica
  armonica, interpolazione sub-campione e stabilizzazione in dominio musicale.
- Preset per chitarra, basso, ukulele, violino e mandolino, inclusi Drop D, Drop C,
  DADGAD, Open G e chitarra a sette corde.
- Lancetta ad alta leggibilità, stroboscopio direzionale, cronologia in cent,
  telemetria di affidabilità e stabilità e controllo progressivo delle corde.
- Calibrazione A4, sensibilità regolabile, toni guida e scorciatoia da tastiera.
- Test numerici deterministici dell'algoritmo e documentazione di sviluppo.
- Strumenti WebMCP per leggere e impostare la configurazione attraverso gli stessi
  controlli dell'interfaccia, senza automatizzare il consenso al microfono.
- Modalità polifonica capace di analizzare con una pennata tutte le corde del preset,
  mostrando per ciascuna deviazione, direzione della correzione e stato di accordatura.
- Rilevatore multi-pitch FFT ad alta risoluzione con consenso fra più parziali e
  soppressione delle collisioni armoniche tra corde.
- Test deterministici su pennate sintetiche a sei corde, inclusi scostamenti diversi,
  rumore, inviluppo naturale e controllo dei falsi positivi su corde assenti.
- Distribuzione CI/CD su Contabo con build verificata, rilascio statico atomico e
  pubblicazione sotto `gianlucabove.it/accorda`.

### Changed

- Rende la vista polifonica più immediata con un display a matrice: verde entro una
  tolleranza pratica di ±2 cent e rosso per le corde che richiedono correzione.
- Rinomina il progetto e l'intera interfaccia da Aurelia Tuner ad Accorda.
- Introduce una modalità Auto che passa con isteresi dalla griglia polifonica all'ago
  di precisione: con meno di quattro corde segue la nota predominante e mostra la
  griglia da quattro corde simultanee.
- Sostituisce la precedente palette verde-blu con un'identità originale basata su
  melanzana, corallo, viola e turchese, preservando il significato degli stati.
- Restringe a ±1 cent la zona considerata intonata e il completamento automatico
  delle corde, con un indicatore visivo coerente con la nuova tolleranza.
- Rafforza i test numerici su tutto il registro della chitarra, includendo segnali
  armonici, rumore deterministico e scostamenti frazionali dalla nota di riferimento.
- Estende la configurazione WebMCP alla scelta tra modalità di precisione e polifonica.
- Aggiunge nell'intestazione il collegamento per tornare alla home dell'autore.

### Fixed

- Evitati aggiornamenti ripetuti quando una corda già confermata rimane stabilmente
  intonata durante una sessione di ascolto prolungata.
