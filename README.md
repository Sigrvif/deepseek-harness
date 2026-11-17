# DSLRH (DeepSeek Harness fork)

English | [中文](README.zh.md)

> **DSLRH** is an **unofficial fork** of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (base: v0.2.2-alpha.2), maintained by Shisaye.
> It adds a native **Context Editor**, **Context Fold**, bundled superpowers skills, an MCP server manager, and more — the complete inventory of fork additions lives in [FORK.md](FORK.md), user documentation in [docs/dslrh/](docs/dslrh/).
> This is not the official project: issues and feature requests for the fork belong in [this repository's issues](https://github.com/Sigrvif/deepseek-harness/issues); the channels under "Community and support" below belong to **upstream**.

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm` (official upstream release)

> `npx @deepseek-ai/dsh` installs and runs the **official upstream** release, not this fork. To run DSLRH, use the source instructions below.

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/Sigrvif/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- **DSLRH (this fork):** report issues and request fork features in [this repository's issues](https://github.com/Sigrvif/deepseek-harness/issues).
- **Upstream** (official project): feedback and bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions); plugin authors can add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic for discoverability; community chat on the <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
