# Client-Agnostic B2C
## Building systems with longevity

---

# The Problem

Global platforms fail local businesses. Three ways:

---

# 1. One-Size-Fits-All

Blanket solutions ignore local context.

Seasonal pricing for tourist season? Integration with your tools?
Too niche. Not on the roadmap. 10% please.

---

# 2. One Client Fits All

Not everyone interacts the same way.

Screen readers. AI assistants. Voice control.
If you're not the average user, you're an afterthought.

---

# 3. Built For Today

Technology keeps shifting.

Yesterday websites. Today apps. Tomorrow AI.

Client-specific systems break when paradigms change.

---

# A Different Approach

**One-size-fits-all** → Targeted solutions for local problems.

**One client fits all** → Any client can plug in. All equal.

**Built for today** → Backend-first. Build once, clients come and go.

---

# How It Works

Standardised APIs (REST + MCP).

- Business logic is local (your rules, your pricing, your context)
- Interfaces are universal (any client can plug in)
- New paradigm? Build a client. Backend doesn't change.

---

# Case Study: Duchy Opera

Cornish charity opera company.

**Local context:**
- Seasonal tourism economy (pricing that reflects it)
- Ageing audience (accessibility isn't optional)
- Charity budget (10% to Eventbrite isn't viable)

**The question:**
Can we build infrastructure that serves *them*, not a platform?

---

# The Architecture

```
        ┌─────────────┐
        │   Backend   │
        │  REST + MCP │
        └──────┬──────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
  Web UI    AI Agent   Future?
```

One system. Many clients. Zero lock-in.

---

# Demo: Web Booking

*[Live demo: customer books tickets via web form]*

Traditional flow. Works today.

---

# Demo: AI Booking

*[Live demo: Claude books tickets via MCP]*

"Book me 2 tickets for Saturday's opera."

Same backend. Different client.

---

# What Changed?

Nothing in the backend.

The AI didn't need a special integration.
It just used the API.

That's the point.

---

# The Economics

| Approach | Cost |
|----------|------|
| Eventbrite | 10% per ticket |
| Custom SaaS | £100s/month |
| Self-hosted | £5/month |

Small orgs can afford professional infrastructure.

---

# Beyond Ticketing

Same pattern works for any B2C:

- Appointments / bookings
- Orders / fulfilment
- Memberships
- Donations

Standardised backend. Client-agnostic. Future-proof.

---

# The Thesis

Global platforms extract value from local communities.

**The alternative:**
- Targeted solutions for proximal problems
- Open infrastructure that communities can own
- Client-agnostic systems that outlast today's paradigms

---

# Build Local. Interface Universal.

Stop predicting the future.

Build systems that don't need you to.

---

# Questions?

github.com/louisdutton/duchyopera

