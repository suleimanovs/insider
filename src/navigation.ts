import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Homes',
      links: [
        {
          text: 'SaaS',
          href: getPermalink('/homes/saas'),
        },
        {
          text: 'Startup',
          href: getPermalink('/homes/startup'),
        },
        {
          text: 'Mobile App',
          href: getPermalink('/homes/mobile-app'),
        },
        {
          text: 'Personal',
          href: getPermalink('/homes/personal'),
        },
      ],
    },
    {
      text: 'Pages',
      links: [
        {
          text: 'Features (Anchor Link)',
          href: getPermalink('/#features'),
        },
        {
          text: 'Services',
          href: getPermalink('/services'),
        },
        {
          text: 'Pricing',
          href: getPermalink('/pricing'),
        },
        {
          text: 'About us',
          href: getPermalink('/about'),
        },
        {
          text: 'Contact',
          href: getPermalink('/contact'),
        },
        {
          text: 'Terms',
          href: getPermalink('/terms'),
        },
        {
          text: 'Privacy policy',
          href: getPermalink('/privacy'),
        },
      ],
    },
    {
      text: 'Landing',
      links: [
        {
          text: 'Lead Generation',
          href: getPermalink('/landing/lead-generation'),
        },
        {
          text: 'Long-form Sales',
          href: getPermalink('/landing/sales'),
        },
        {
          text: 'Click-Through',
          href: getPermalink('/landing/click-through'),
        },
        {
          text: 'Product Details (or Services)',
          href: getPermalink('/landing/product'),
        },
        {
          text: 'Coming Soon or Pre-Launch',
          href: getPermalink('/landing/pre-launch'),
        },
        {
          text: 'Subscription',
          href: getPermalink('/landing/subscription'),
        },
      ],
    },
    {
      text: 'Blog',
      links: [
        {
          text: 'Blog List',
          href: getBlogPermalink(),
        },
        {
          text: 'Article',
          href: getPermalink('get-started-website-with-astro-tailwind-css', 'post'),
        },
        {
          text: 'Article (with MDX)',
          href: getPermalink('markdown-elements-demo-post', 'post'),
        },
        {
          text: 'Category Page',
          href: getPermalink('tutorials', 'category'),
        },
        {
          text: 'Tag Page',
          href: getPermalink('astro', 'tag'),
        },
      ],
    },
    {
      text: 'About',
      href: '/about',
    },
  ],
  actions: [{ text: 'Download', href: 'https://github.com/onwidget/astrowind', target: '_blank' }],
};

export const footerData = {
//   links: [
//     {
//       title: 'Product',
//       links: [
//         { text: 'Features', href: '#' },
//         { text: 'Security', href: '#' },
//         { text: 'Team', href: '#' },
//         { text: 'Enterprise', href: '#' },
//         { text: 'Customer stories', href: '#' },
//         { text: 'Pricing', href: '#' },
//         { text: 'Resources', href: '#' },
//       ],
//     },
//     {
//       title: 'Platform',
//       links: [
//         { text: 'Developer API', href: '#' },
//         { text: 'Partners', href: '#' },
//         { text: 'Atom', href: '#' },
//         { text: 'Electron', href: '#' },
//         { text: 'AstroWind Desktop', href: '#' },
//       ],
//     },
//     {
//       title: 'Support',
//       links: [
//         { text: 'Docs', href: '#' },
//         { text: 'Community Forum', href: '#' },
//         { text: 'Professional Services', href: '#' },
//         { text: 'Skills', href: '#' },
//         { text: 'Status', href: '#' },
//       ],
//     },
//     {
//       title: 'Company',
//       links: [
//         { text: 'About', href: '#' },
//         { text: 'Blog', href: '#' },
//         { text: 'Careers', href: '#' },
//         { text: 'Press', href: '#' },
//         { text: 'Inclusion', href: '#' },
//         { text: 'Social Impact', href: '#' },
//         { text: 'Shop', href: '#' },
//       ],
//     },
//   ],
  secondaryLinks: [
    { text: 'Terms', href: getPermalink('/terms') },
    { text: 'Privacy Policy', href: getPermalink('/privacy') },
  ],
socialLinks: [
  {
    ariaLabel: 'GitHub',
    icon: 'tabler:brand-github',
    href: 'https://github.com/suleimanovs',
  },
  {
    ariaLabel: 'daily.dev',
    icon: 'simple-icons:dailydotdev',
    href: 'https://app.daily.dev/suleimanov',
  },
  {
    ariaLabel: 'LinkedIn',
    icon: 'tabler:brand-linkedin',
    href: 'https://www.linkedin.com/in/suleimanovs/',
  },
  {
    ariaLabel: 'Mastodon',
    icon: 'tabler:brand-mastodon',
    href: 'https://mastodon.social/@suleimanov',
  },
  {
    ariaLabel: 'Bluesky',
    icon: 'tabler:brand-bluesky', // fallback: 'lucide:globe'
    href: 'https://bsky.app/profile/suleimanovs.bsky.social',
  },
  {
    ariaLabel: 'dev.to',
    icon: 'simple-icons:devdotto',
    href: 'https://dev.to/suleimanovs',
  },
  {
    ariaLabel: 'Medium',
    icon: 'tabler:brand-medium',
    href: 'https://medium.com/@suleimanovs',
  },
{
  ariaLabel: 'Google Play',
  icon: 'tabler:brand-google-play', // или 'tabler:brand-google-play'
  href: 'https://play.google.com/store/apps/dev?id=8519842644112481067',
}
,
  {
    ariaLabel: 'RSS',
    icon: 'tabler:rss',
    href: getAsset('/rss.xml'),
  },
],


  footNote: `
<img
  class="w-5 h-5 md:w-6 md:h-6 md:-mt-0.5 bg-cover mr-1.5 rtl:mr-0 rtl:ml-1.5 float-left rtl:float-right rounded-sm"
  src="/src/assets/favicons/favicon.ico"
  alt="suleimanov favicon"
  loading="lazy"
/>
    ©2025 suleimanov
  `,
};
