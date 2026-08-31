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

We are a grassroots journal club initiative that helps researchers create local Open Research journal clubs at their universities to discuss diverse issues, papers and ideas about improving research, reproducibility and the Open Research movement. Started in early 2018 at the University of Oxford, ReproducibiliTea has now spread to {{ site.journal-clubs.size }} institutions in {{ country_count }} different countries. We are completely volunteer run, and provide a unique and supportive community for our members, who are predominantly Early Career Researchers.

We all know how horrible it can be to jump through annoying administrative hurdles or dodge financial barriers to ultimately try to make a positive change. Setting up a ReproducibiliTea Journal Club is easy, free and does not need any admin approval. In a ReproducibiliTea Journal Club, papers are selected that are broadly relevant to the replication crisis and research improvements. The journal club is advertised around the department or university, raising awareness of reproducibility and Open Research in the process. The chosen papers are then discussed during regular journal club meetings, often over cups of tea, lunch or snacks.

Want to join the movement? Grab your cup of (Reproducibili)tea and dive in.
<a rel="me" href="https://scicomm.xyz/@ReproducibiliTeaGlobal" aria-hidden="true" tabindex="-1"></a>

{% include jc-map.html %}

<br/>

## What's on?

<div class="cta-buttons">
  <a class="mock-button" href="/journal-clubs/">Find a journal club</a>
  <a class="mock-button" href="/calendar/">Join an online session</a>
</div>

<br/>

## Current Journal Clubs

{% include jc-showcase.html initial-value="" %}

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

## Our sponsors

{% include sponsors.html %}

<br/>

## Podcast

Not ready to start your own journal club, but interested in Open Research and want to learn more? We also release ReproducibiliTea podcast episodes that highlight the great work of early career researchers in Open Research.

{% include podcast.html %}

<br/>

## Articles

ReproducibiliTea was featured in the following articles:

* Bochynska, A., Kalandadze, T., Korbmacher, M., Mayiwar, L., Mayor, J., & Quintana, D. (2025). **Grassroots networks can help implement and harmonize open research efforts**. Nordic Perspectives on Open Science, 10. [https://doi.org/10.7557/11.8343](https://doi.org/10.7557/11.8343)
* Skubera, M., Korbmacher, M., Evans, T. R., Azevedo, F., & Pennington, C. R. (2025). **International initiatives to enhance awareness and uptake of open research in psychology: a systematic mapping review**. Royal Society Open Science, 12(3), 241726. [http://doi.org/10.1098/rsos.241726](http://doi.org/10.1098/rsos.241726)
* Vinatier, C., Kozula, M., Van den Eynden, V., Caquelin, L., Roubik, H., Stegeman, I., & Naudet, F. (2024). **Public engagement with research reproducibility**. PLoS biology, 22(12), e3002953. [https://doi.org/10.1371/journal.pbio.3002953](https://doi.org/10.1371/journal.pbio.3002953)

[See all associated publications](/publications/)
