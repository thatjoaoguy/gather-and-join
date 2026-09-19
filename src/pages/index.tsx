import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const FEATURES: Array<{title: string; body: string}> = [
  {title: 'Everyone stays in step', body: 'Play, pause, or seek and the whole room follows. If someone buffers, the room pauses and says who.'},
  {title: 'A call alongside the show', body: 'Voice is on when you join, camera is opt-in. Media goes directly between you and your friends, never through a server.'},
  {title: 'Your own subscriptions', body: 'Each viewer watches through the service\'s own player, signed in to their own account. Nothing is captured, re-streamed, or altered.'},
];

export default function Home(): ReactNode {
  return (
    <Layout description="Watch together in sync, with voice and video. Each viewer uses their own subscription.">
      <header className={styles.hero}>
        <div className={`container ${styles.inner}`}>
          <div>
            <Heading as="h1">A little <em>closer</em>.<br />Even from <span>afar</span>.</Heading>
            <p className={styles.lead}>Gather &amp; Join keeps a small group in sync while they watch the same episode, and adds a voice call so it feels like one room. Currently works with HBO Max; more services are on the way.</p>
            <div className={styles.actions}>
              <Link className="button button--primary button--lg" to="/docs/install">Install</Link>
              <Link className="button button--red button--lg" to="/docs/host-a-server">Host a server</Link>
            </div>
          </div>
          <aside className={styles.card} aria-label="At a glance">
            <div><strong>Works with</strong><span>HBO Max</span></div>
            <div><strong>Room size</strong><span>Best up to 6 on camera, more on voice</span></div>
            <div><strong>Server</strong><span>Self-hosted, one file, no accounts</span></div>
            <div><strong>Cost</strong><span>Free, open source (MIT)</span></div>
          </aside>
        </div>
      </header>
      <main>
        <section className={styles.section}>
          <div className="container">
            <div className={styles.grid}>
              {FEATURES.map((f) => (
                <div key={f.title} className={styles.feature}>
                  <Heading as="h3">{f.title}</Heading>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={styles.section}>
          <div className="container">
            <Heading as="h2">Three steps to a good night</Heading>
            <ol>
              <li>Someone in the group runs the small companion server and shares its address. See <Link to="/docs/host-a-server">Host a server</Link>.</li>
              <li>Everyone installs the extension and enters that address once on the setup page.</li>
              <li>One person opens the episode, presses <strong>Create a room</strong>, and reads out the six-character code. Everyone else presses <strong>Join</strong>.</li>
            </ol>
            <p className={styles.fine}>Use headphones. Echo cancellation is tuned for the call, not for a show playing out of your speakers.</p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
