# Signal Tools

Small, standards-focused utilities for JavaScript Signals, developed and tested together in one npm workspace.

| Package                                             | Description                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| [`@signal-tools/signal`](packages/signal)           | A small, performance-optimized, spec-compliant TC39 Signals implementation |
| [`@signal-tools/effect`](packages/effect)           | Microtask-batched effects for TC39 Signals                                 |
| [`@signal-tools/collections`](packages/collections) | Signal-aware native Array, Map, Set, and Object collections                |
| [`@signal-tools/cssom`](packages/cssom)             | Signal-driven utilities for stylesheets and the CSS Object Model           |
| [`@signal-tools/dom`](packages/dom)                 | Functional DOM, SVG, and MathML templating with TC39 Signals               |

## Development

```shell
npm install
npm run build
npm test
```

The packages retain independent npm versions and public APIs. npm workspaces link matching local package versions, so
the repository can be installed and tested before any package is published.

## License

[MIT-0](LICENSE.md) — No attribution required.
