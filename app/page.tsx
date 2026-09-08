import TunerClient from './tuner-client';

export const dynamic = 'force-static';

/** Mantiene la route esportabile lasciando al componente client l'audio interattivo. */
export default function Home() {
  return <TunerClient />;
}
