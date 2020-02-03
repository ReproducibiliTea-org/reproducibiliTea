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
{% assign country_count = countries | split: "|" | uniq | size %}

# **Welcome to ReproducibiliTea**

We are a grassroots [journal club initiative](/about/) that helps young researchers create local Open Science journal clubs at their universities to discuss diverse issues, papers and ideas about improving science, reproducibility and the Open Science movement. Started in early 2018 at the University of Oxford, ReproducibiliTea has now spread to {{ site.journal-clubs.size }} institutions in {{ country_count }} different countries. We are completely volunteer run, and provide a unique and supportive community for our members.

<div id="map">
    <iframe src="https://www.google.com/maps/d/embed?mid=1K1Z3VYsgIDT7ynQraHrTD16TfJM6Wf3k" width="640" height="320"></iframe>
</div>

Want to join the movement? Grab your cup of (Reproducibili)tea and use our freely accessible and adaptable materials to start organising your own [journal club](/journal-clubs/) today.

# Definition of a ReproducibiliTea journal club

1. You have emailed ReproducibiliTea (email: amy.orben@cantab.net) registering your club
2. Your club examines topics related to reproducibility, open science, research quality, or good/bad research practices (in any field).

# Current Journal Clubs

{% assign countries = countries | split: "|" | uniq | sort_natural %}
{% for c in countries %}
{% assign jcs = site.journal-clubs | where: "country", c %}
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


