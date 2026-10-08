---
name: unit-economics
description: Calculates whether a product, service or side business pays off — cost per unit, margin, monthly profit in three scenarios, break-even, sensitivity, and the cheapest test of the idea — with all math done in code. Use for pricing, quotes, "окупится ли", "сколько можно заработать", "посчитай маржу", "юнит-экономика", "is this profitable".
argument-hint: "[product or service, price, volumes]"
---

# Unit economics / Юнит-экономика

Idea: $ARGUMENTS

Reply in the user's language and currency.

1. **Offer:** what is sold, to whom, through which channel.
2. **Assumptions table** — value, unit, source or "оценка/estimate":
   price · materials per unit · labour hours per unit × value of an hour · consumables · equipment cost ÷ its lifetime in units · packaging and delivery · platform/marketplace commission · payment fees · taxes for the user's legal form (self-employed, sole trader, company) · ad cost per sale · defect/return rate.
3. **Compute in Python** (show the code and the table):
   - per unit: revenue, variable cost, contribution margin, margin %;
   - per month for pessimistic / base / optimistic volumes: revenue, costs, profit, hours of the user's time, profit per hour;
   - upfront investment and months to break even.
4. **Sensitivity:** change each key assumption by ±20 % and show which moves profit most.
5. **Target check:** if the user named an income goal, show how many units or clients per month it needs and whether that is realistic for one person.
6. **Verdict** and **the cheapest 2–4 week test** (pre-orders, one batch, an ad test) with the number that decides go / no-go.

Check current market prices for key inputs on the web and link them. This is an estimate, not financial or tax advice. Delegate complex models to the `business-analyst` agent.
