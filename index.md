---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: default
---

{% assign countries = "" %}
{% for jc in site.journal-clubs %}
{% if jc.country %}
{% assign countries = countries | append: "|" | append: jc.country %}
{% endif %}
{% endfor %}
{% assign country_count = countries | split: "|" | uniq | size | minus: 1 %}


# **Welcome to ReproducibiliTea**

- Discuss open research practices
- Drink tea
- Build <a href="/about/">a community</a>

<a rel="me" href="https://scicomm.xyz/@ReproducibiliTeaGlobal" aria-hidden="true" tabindex="-1"></a>

## What's on?

<div class="cta-buttons">
  <a class="mock-button" href="/journal-clubs/">Find a journal club</a>
  <a class="mock-button" href="/calendar/">Join an online session</a>
</div>

<br/>

## Current Journal Clubs

{% include jc-map.html %}

<br/>

{% assign updated_jc = site.journal-clubs | where_exp: "item", "item.status != 'pending'" | sort: "last-update-timestamp" | last %}
{% assign spotlight_jc = site.journal-clubs | where_exp: "item", "item.status != 'pending'" | sample %}
<div class="jc-teaser-grid">
  <div class="jc-teaser-card">
    <span class="jc-teaser-label">Recently updated</span>
    <h4><a href="/journal-clubs/#{{ updated_jc.title }}">{{ updated_jc.title }}</a></h4>
    <p>{{ updated_jc.host-organisation }} · {{ updated_jc.country }}</p>
  </div>
  <div class="jc-teaser-card">
    <span class="jc-teaser-label">Spotlight</span>
    <h4><a href="/journal-clubs/#{{ spotlight_jc.title }}">{{ spotlight_jc.title }}</a></h4>
    <p>{{ spotlight_jc.host-organisation }} · {{ spotlight_jc.country }}</p>
  </div>
</div>
<a class="mock-button" href="/journal-clubs/">Browse all journal clubs</a>

<br/>

## Podcast

Not ready to start your own journal club, but interested in Open Research and want to learn more? We also release ReproducibiliTea podcast episodes that highlight the great work of early career researchers in Open Research.

{% include podcast.html %}

<br/>

## Articles

ReproducibiliTea features in the following articles:

* Bochynska, A., Kalandadze, T., Korbmacher, M., Mayiwar, L., Mayor, J., & Quintana, D. (2025). **Grassroots networks can help implement and harmonize open research efforts**. Nordic Perspectives on Open Science, 10. [https://doi.org/10.7557/11.8343](https://doi.org/10.7557/11.8343)
* Skubera, M., Korbmacher, M., Evans, T. R., Azevedo, F., & Pennington, C. R. (2025). **International initiatives to enhance awareness and uptake of open research in psychology: a systematic mapping review**. Royal Society Open Science, 12(3), 241726. [http://doi.org/10.1098/rsos.241726](http://doi.org/10.1098/rsos.241726)
* Vinatier, C., Kozula, M., Van den Eynden, V., Caquelin, L., Roubik, H., Stegeman, I., & Naudet, F. (2024). **Public engagement with research reproducibility**. PLoS biology, 22(12), e3002953. [https://doi.org/10.1371/journal.pbio.3002953](https://doi.org/10.1371/journal.pbio.3002953)

[See all associated publications](/publications/)
