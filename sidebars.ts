import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'install',
    {
      type: 'category',
      label: 'Hosting a server',
      // Expanded: the Render page is the recommended route and should not be a click away.
      collapsed: false,
      items: [
        'host-a-server',
        'host-on-your-machine',
        'host-on-your-network',
      ],
    },
    {
      type: 'category',
      label: 'Watch together',
      link: {type: 'doc', id: 'watch-together'},
      items: [
        'watch-together/hbo-max',
        'watch-together/youtube',
        'watch-together/google-drive',
        'watch-together/wix-video',
        'watch-together/when-copies-differ',
      ],
    },
    'how-it-stays-in-sync',
    {
      type: 'category',
      label: 'Development',
      link: {type: 'doc', id: 'development/index'},
      items: [
        'development/architecture',
        'development/sync-and-protocol',
        'development/testing',
        'development/diagnostics',
      ],
    },
    'troubleshooting',
  ],
};

export default sidebars;
