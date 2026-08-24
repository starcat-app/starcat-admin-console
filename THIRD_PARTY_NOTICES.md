# Third-party notices

Starcat Admin Console is built with open-source packages declared in `package.json` and locked by
`pnpm-lock.yaml`. Their authors retain their respective copyrights and license terms.

## Bundled user-interface components

| Component                          | License                                     | Copyright / project                                                   |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Geist Variable Font                | SIL Open Font License 1.1                   | Copyright 2024 The Geist Project Authors                              |
| Lucide                             | ISC; selected Feather-derived icons are MIT | Copyright 2026 Lucide contributors; Copyright 2013-present Cole Bemis |
| React and React DOM                | MIT                                         | Meta Platforms, Inc. and affiliates                                   |
| Radix UI                           | MIT                                         | WorkOS                                                                |
| shadcn/ui                          | MIT                                         | shadcn                                                                |
| TanStack Router and Query          | MIT                                         | TanStack                                                              |
| Hono                               | MIT                                         | Hono contributors                                                     |
| Class Variance Authority           | Apache-2.0                                  | Joe Bell                                                              |
| Tailwind Merge and tw-animate-css  | MIT                                         | Their respective contributors                                         |
| Zod, Sonner, clsx, and next-themes | MIT                                         | Their respective contributors                                         |

The complete dependency graph includes transitive packages under MIT, Apache-2.0, BSD, ISC,
OFL-1.1, Python-2.0, CC-BY-4.0, BlueOak-1.0.0, Unlicense, and 0BSD terms. Audit the exact locked
versions before publishing a compiled bundle:

```bash
pnpm licenses list --prod
```

Installed packages include their full license texts under `node_modules`. Any redistributed build
archive must include this notice and the applicable license texts, especially the Geist OFL-1.1
license and copyright notice.
