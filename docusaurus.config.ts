import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const OWNER = 'thatjoaoguy';
const REPO = 'gather-and-join';

const config: Config = {
  title: 'Gather & Join',
  tagline: 'Watch together in sync, with voice and video. Everyone plays from their own account.',
  favicon: 'brand/icon-32.png',
  future: {v4: true},

  url: `https://${OWNER}.github.io`,
  baseUrl: `/${REPO}/`,
  organizationName: OWNER,
  projectName: REPO,
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  i18n: {defaultLocale: 'en', locales: ['en']},

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: `https://github.com/${OWNER}/${REPO}/edit/docs/`,
        },
        blog: false,
        theme: {customCss: './src/css/custom.css'},
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'brand/icon-512.png',
    // The design system is dark only.
    colorMode: {defaultMode: 'dark', disableSwitch: true, respectPrefersColorScheme: false},
    navbar: {
      title: '',
      logo: {alt: 'Gather & Join', src: 'brand/lockup.svg', width: 168, height: 40},
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Guide'},
        {to: '/privacy', label: 'Privacy', position: 'left'},
        {href: `https://github.com/${OWNER}/${REPO}`, label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {title: 'Guide', items: [
          {label: 'Install', to: '/docs/install'},
          {label: 'Host a server', to: '/docs/host-a-server'},
          {label: 'Watch together', to: '/docs/watch-together'},
        ]},
        {title: 'Project', items: [
          {label: 'Privacy policy', to: '/privacy'},
          {label: 'Changelog', href: `https://github.com/${OWNER}/${REPO}/blob/main/CHANGELOG.md`},
          {label: 'Report a bug', href: `https://github.com/${OWNER}/${REPO}/issues/new/choose`},
        ]},
      ],
      copyright: `Gather & Join is independent software, not affiliated with, endorsed by, or sponsored by any streaming service. Service names are trademarks of their owners. MIT licensed.`,
    },
    prism: {theme: prismThemes.dracula, darkTheme: prismThemes.dracula},
  } satisfies Preset.ThemeConfig,
};

export default config;
