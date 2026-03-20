# Watch Sources Registry
**Owner:** Bild x Foundry
**Last updated:** March 2026
**Purpose:** Canonical source list for Sift's Watch Sources feature. Three functions: (1) spec input for Claude Code build, (2) seed data for LLM Radar project configuration, (3) editorial defaults for future Sift users.

---

## Poll Frequency Tiers
- **Daily (6hr)** — Fast-moving, high operational relevance
- **Weekly (24hr)** — Digest-worthy, strategic orientation

---

## Tier 1 — Anthropic Core (Daily)
| Name | RSS / URL | Why |
|------|-----------|-----|
| Anthropic News | https://www.anthropic.com/news | Official model/tool/pricing drops |
| Anthropic Docs | https://docs.claude.com | API changes, capability updates |
| Anthropic Research | https://www.anthropic.com/research | Safety + architecture signals |

---

## Tier 2 — American Labs (Daily)
| Name | RSS / URL | Why |
|------|-----------|-----|
| OpenAI Blog | https://openai.com/blog/rss | GPT-5, o-series, Operator |
| Google DeepMind | https://deepmind.google/blog/rss | Gemini, Veo, AlphaCode |
| Meta AI Blog | https://ai.meta.com/blog/feed | Llama drops — open source baseline |
| Mistral Blog | https://mistral.ai/news/rss | Efficient architecture signals |
| xAI Blog | https://x.ai/blog | Grok, real-time web integration |
| Perplexity Blog | https://blog.perplexity.ai/rss | Search-native AI — Sift positioning |

---

## Tier 3 — Chinese Labs (Daily)
| Name | RSS / URL | Why |
|------|-----------|-----|
| DeepSeek GitHub | https://github.com/deepseek-ai | Cost-efficiency benchmarks that reset expectations |
| Qwen / Alibaba | https://qwenlm.github.io/feed.xml | Strong multilingual + code |
| Moonshot AI (Kimi) | https://kimi.moonshot.cn | Long context innovation |
| Zhipu AI (GLM) | https://zhipuai.cn/news | Under-watched open-source |
| MiniMax Blog | https://minimaxi.com/news | Multimodal — quietly competitive |
| 01.AI (Yi) | https://01.ai/blog | Kai-Fu Lee's lab — well-funded |
| StepFun | https://stepfun.com/blog | Multimodal image + video |
| Baidu ERNIE | https://research.baidu.com | Enterprise AI in China — B2B signals |

---

## Tier 4 — Rest of World (Daily)
| Name | RSS / URL | Why |
|------|-----------|-----|
| Cohere Blog | https://cohere.com/blog/rss | Enterprise RAG + embeddings |
| Stability AI | https://stability.ai/blog/rss | Image/audio/video gen — Repict-adjacent |
| Aleph Alpha | https://aleph-alpha.com/blog/feed | EU sovereign AI — regulatory signals |
| TII Falcon | https://falconllm.tii.ae | Middle East AI — geo-political diversification |
| Sarvam AI | https://sarvam.ai/blog | Indian language models — future portfolio |
| HyperCLOVA / NAVER | https://clova.ai/en/research | Korean AI — D2C relevance for Repict |

---

## Tier 5 — Research Layer (Weekly)
| Name | RSS / URL | Why |
|------|-----------|-----|
| arXiv cs.AI | https://arxiv.org/rss/cs.AI | Raw papers — catch architecture shifts 6-18mo early |
| arXiv cs.LG | https://arxiv.org/rss/cs.LG | Machine learning fundamentals |
| Hugging Face Blog | https://huggingface.co/blog/feed.xml | Open source releases, benchmarks |
| Papers With Code | https://paperswithcode.com/rss | What's reproducible, benchmark movement |
| Import AI (Jack Clark) | https://importai.substack.com/feed | Best signal-to-noise in research coverage |
| The Gradient | https://thegradient.pub/rss | Long-form AI research journalism |
| LessWrong AI | https://www.lesswrong.com/feed.xml?view=tagged&tag=AI | Safety research — shapes Anthropic direction |

---

## Tier 6 — Builder / Developer Layer (Daily)
| Name | RSS / URL | Why |
|------|-----------|-----|
| Simon Willison | https://simonwillison.net/atom/everything | Best independent LLM practitioner coverage |
| Lilian Weng | https://lilianweng.github.io/feed.xml | Deep technical — agent architectures |
| LangChain Blog | https://blog.langchain.dev/rss | Agent tooling — Phase 2 governance agent |
| LlamaIndex Blog | https://www.llamaindex.ai/blog/rss | RAG + context — Sift export pipeline |
| Hacker News (Anthropic) | https://hnrss.org/newest?q=anthropic | Community implications, not just announcements |
| Hacker News (Show HN) | https://hnrss.org/show | What builders are shipping — earliest product signals |
| GitHub Trending (AI) | https://github.com/trending/python?since=weekly | New repos — early pattern detection |

---

## Tier 7 — Industry Intelligence (Weekly)
| Name | RSS / URL | Why |
|------|-----------|-----|
| Benedict Evans | https://www.ben-evans.com/benedictevans/rss.xml | Tech strategy — macro AI narrative |
| a16z AI | https://a16z.com/tag/ai/feed | VC thesis = where products are going |
| Sequoia Capital Blog | https://www.sequoiacap.com/blog/feed | Investment signals |
| TechCrunch AI | https://techcrunch.com/category/artificial-intelligence/feed | Startup funding — where money is betting |

---

## Competitive Intelligence — Sift Positioning (Weekly)
| Name | RSS / URL | Why |
|------|-----------|-----|
| Are.na Blog | https://www.are.na/blog/rss | Direct Sift design reference |
| Mem Blog | https://get.mem.ai/blog/rss | Agent memory — ecosystem watch |
| Readwise Blog | https://blog.readwise.io/rss | Reader UX patterns |

---

## Evaluation Routing Filter
Every auto-capture in LLM Radar runs through this filter:

→ Changes what Sift can build or how?        → Sift technical queue
→ Changes how Claude Code sessions run?       → Update CLAUDE.md / skill files
→ New revenue or partnership lever for Bild?  → Bild strategic queue
→ Changes how Foundry studies AI systems?     → Foundry protocol update
→ Affects Aravind's daily workflow?           → POA integration, test immediately
→ None of the above?                          → Discard

---

## Seeded Project Defaults (Post-Build)
When Watch Sources ships, pre-populate for "AI Research" project type:
- Anthropic News (Tier 1)
- OpenAI Blog (Tier 2)
- DeepSeek GitHub (Tier 3)
- Hugging Face Blog (Tier 5)
- Simon Willison (Tier 6)
- Hacker News Anthropic (Tier 6)
