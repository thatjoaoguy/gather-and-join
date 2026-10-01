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
    'watch-together',
    'how-it-stays-in-sync',
    'troubleshooting',
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
  ],
};

export default sidebars;
