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

We are a grassroots [journal club initiative](/about/) that helps researchers create local Open Science journal clubs at their universities to discuss diverse issues, papers and ideas about improving science, reproducibility and the Open Science movement. Started in early 2018 at the University of Oxford, ReproducibiliTea has now spread to {{ site.journal-clubs.size }} institutions in {{ country_count }} different countries. We are completely volunteer run, and provide a unique and supportive community for our members, who are predominantly Early Career Researchers.

Want to join the movement? Just curious for now? Grab your cup of (Reproducibili)tea and use our freely accessible and adaptable materials to [get started](/getting-started/) today.
<a rel="me" href="https://scicomm.xyz/@ReproducibiliTeaGlobal"></a>

{% include jc-map.html %}

<br/>


# Current Journal Clubs

{% include jc-showcase.html initial-value="" %}

{% assign countries = countries | split: "|" | uniq | sort_natural %}
{% for c in countries %}
{% assign jcs = site.journal-clubs | where: "country", c %}
{% assign jcs = jcs | sort_natural: "title" %}
{% assign jc_count = jcs | size %}
{% if jc_count > 0 %}
{:.jc-list #{{c}}}
## {{ c }} 
{% for jc in jcs %}
- [{{ jc.title }}](/journal-clubs/#{{ jc.title }}) ({{ jc.organisers | join: ", " }})
{:.jc-list}
{% endfor %}
{% endif %}
{% endfor %}

<br/>

# Podcast

{% include podcast.html %}
