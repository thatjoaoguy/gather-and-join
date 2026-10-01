import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './index.module.css';

const FEATURES: Array<{id: string; title: string; body: string}> = [
  {
    id: 'in-step',
    title: translate({id: 'home.feature.inStep.title', message: 'Everyone stays in step'}),
    body: translate({id: 'home.feature.inStep.body', message: 'Play, pause, or seek and the whole room follows. If someone buffers, the room pauses and says who.'}),
  },
  {
    id: 'call',
    title: translate({id: 'home.feature.call.title', message: 'A call alongside the show'}),
    body: translate({id: 'home.feature.call.body', message: 'Voice is on when you join, camera is opt-in. Media goes directly between you and your friends, never through a server.'}),
  },
  {
    id: 'accounts',
    title: translate({id: 'home.feature.accounts.title', message: 'Your own accounts'}),
    body: translate({id: 'home.feature.accounts.body', message: 'Each viewer watches through the service\'s own player, signed in to their own account — on Google Drive, the same file shared with each of them. Nothing is captured, re-streamed, or altered.'}),
  },
];

export default function Home(): ReactNode {
  return (
    <Layout description={translate({id: 'home.description', message: 'Watch together in sync, with voice and video. Everyone plays from their own account.'})}>
      <header className={styles.hero}>
        <div className={`container ${styles.inner}`}>
          <div>
            <Heading as="h1">
              <Translate id="home.hero.line1" values={{closer: <em><Translate id="home.hero.closer">closer</Translate></em>}}>
                {'A little {closer}.'}
              </Translate>
              <br />
              <Translate id="home.hero.line2" values={{afar: <span><Translate id="home.hero.afar">afar</Translate></span>}}>
                {'Even from {afar}.'}
              </Translate>
            </Heading>
            <p className={styles.lead}>
              <Translate id="home.hero.lead">
                Gather &amp; Join keeps a small group in sync while they watch the same thing, and adds a voice call so it feels like one room. Works with HBO Max, YouTube, video files on Google Drive, and the video player on Wix sites; more services are on the way.
              </Translate>
            </p>
            <div className={styles.actions}>
              <Link className="button button--primary button--lg" to="/docs/install"><Translate id="home.cta.install">Install</Translate></Link>
              <Link className="button button--red button--lg" to="/docs/host-a-server"><Translate id="home.cta.host">Host a server</Translate></Link>
            </div>
          </div>
          <aside className={styles.card} aria-label={translate({id: 'home.glance.label', message: 'At a glance'})}>
            <div><strong><Translate id="home.glance.worksWith">Works with</Translate></strong><span>HBO Max, YouTube, Google Drive, Wix Video</span></div>
            <div><strong><Translate id="home.glance.roomSize">Room size</Translate></strong><span><Translate id="home.glance.roomSize.value">Best up to 6 on camera, more on voice</Translate></span></div>
            <div><strong><Translate id="home.glance.server">Server</Translate></strong><span><Translate id="home.glance.server.value">Self-hosted, one file, no accounts</Translate></span></div>
            <div><strong><Translate id="home.glance.cost">Cost</Translate></strong><span><Translate id="home.glance.cost.value">Free, open source (MIT)</Translate></span></div>
          </aside>
        </div>
        <div className="container">
          <img
            className={styles.shot}
            src={useBaseUrl('/img/room.webp')}
            width={1280}
            height={729}
            alt={translate({id: 'home.shot.alt', message: 'A room in progress: the episode playing, the room popup with its invite code and three people connected, and webcam tiles for the call beside the player.'})}
          />
        </div>
      </header>
      <main>
        <section className={styles.section}>
          <div className="container">
            <div className={styles.grid}>
              {FEATURES.map((f) => (
                <div key={f.id} className={styles.feature}>
                  <Heading as="h3">{f.title}</Heading>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={styles.section}>
          <div className="container">
            <Heading as="h2"><Translate id="home.steps.title">Three steps to a good night</Translate></Heading>
            <ol>
              <li>
                <Translate id="home.steps.server" values={{link: <Link to="/docs/host-a-server"><Translate id="home.steps.server.link">Host a server</Translate></Link>}}>
                  {'Someone in the group runs the small companion server and shares its address. See {link}.'}
                </Translate>
              </li>
              <li><Translate id="home.steps.install">Everyone installs the extension and enters that address once on the setup page.</Translate></li>
              <li>
                {/* The button names stay as the extension shows them, which is in English. */}
                <Translate id="home.steps.room" values={{create: <strong>Create a room</strong>, join: <strong>Join</strong>}}>
                  {'One person opens the episode or video, presses {create}, and reads out the six-character code. Everyone else presses {join}.'}
                </Translate>
              </li>
            </ol>
            <p className={styles.fine}><Translate id="home.steps.headphones">Use headphones. Echo cancellation is tuned for the call, not for a show playing out of your speakers.</Translate></p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
