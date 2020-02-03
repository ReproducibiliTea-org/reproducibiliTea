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
**{{ c }}**
{% assign jcs = site.journal-clubs | where: "country", c %}
{% for jc in jcs %}
- [{{ jc.title }}](/journal-clubs/#{{ jc.title | url_encode }}) ({%for o in jc.organisers %}{{ o }}{% unless forloop.last %}, {% endunless %}{% endfor %})
{% endfor %}
{% endfor %}

**Australia**
- [Melbourne](/journal-clubs/#Melbourne) (Andy Head, Sally Grace. Philip Newall)
- [Hobart](/journal-clubs/#Hobart), Tasmania (Emily Lowe-Calverley, Jim Sauer)

**Austria**
- [Graz](/journal-clubs/#Graz) (Gaby Hofer and Hilmar Brohmer)

**Belgium**
- Leuven (coming soon!)
- [Kortrijk](/journal-clubs/#Kortrijk) (Ana Barbosa Mendes, Naina Goel)

**Canada**
- [McMaster](/journal-clubs/#McMaster) (Matthew Jordan, Michael Galang)
- [Toronto](/journal-clubs/#Toronto), York University (Mark Adkins, Stephan Bonfield)
- [Vancouver](/journal-clubs/#Vancouver) (Justin Boldsen)

**Czech Republic**
- [Olomouc](/journal-clubs/#Olomouc), Palacký University (Tomas Heger and Martin Vondrak)

**Denmark**
- Copenhagen (Niels Menezes)

**France**
- [Lyon](/journal-clubs/#Lyon') (Wanda Grabon)

**Germany**
- [Berlin](/journal-clubs/#Berlin) (Sophia Crüwell, Corinna Hartling, An Bin Cho)
- Dresden (coming soon!)
- [Frankfurt](/journal-clubs/#Frankfurt) (Julia Beitner, Elli Zey)
- [Munich](/journal-clubs/#Munich) (Stephan Nuding, Leonhard Schramm, Laura Goetz, Felix Schönbrodt)
- Potsdam (coming soon!)
- [Wuerzburg](/journal-clubs/#Wuerzburg) (Lea Hildebrandt, Eda Kir, Patrick Kaschel)

**India**
- [Virtual journal club organised by bioclues.org](/journal-clubs/#Biocluesl }}) (Prash and  Team  Bioclues.org)

**Ireland**
- Dublin (coming soon!)

**Japan**
- [Fukuoka](/journal-clubs/#Fukuoka), Kyushu University (Yuki Yamada)

**The Netherlands**
- [Amsterdam, UvA](/journal-clubs/#Amsterdam) (Angelika Stefan, Florian Wanders)
- Amsterdam, VU (coming soon!)
- [Groningen](/journal-clubs/#Groningen) (Daan Ornée)
- [Leiden](/journal-clubs/#Leiden) (Ricci Proppert)
- [Nijmegen](/journal-clubs/#Nijmegen) (Eirini Zormpa, Johannes Algermissen, Kristijan Armeni, Jeanette Mostert)
- [Rotterdam](/journal-clubs/#Rotterdam) (Antonio Schettino)

**Singapore**
- [Singapore](/journal-clubs/#Singapore), Nanyang Technological University (Alexa von Hagen)

**Spain**
- Madrid (coming soon!)

**Sweden**
- [Linköping](/journal-clubs/#Linköping) (Lina Koppel, Henrik Danielsson)
- [Linnaeus University](/journal-clubs/#Växjö-Kalmar), Växjö-Kalmar (Thomas Nordström, Viktor Kaldo, Rickard Carlsson)
- Stockholm, [Karolinska Institutet](/journal-clubs/#Karolinska) (Robin Fondberg)
- [Stockholm](/journal-clubs/#Stockholm) (Stephen Pierzchajlo, Rasmus Eklund)

**Switzerland**
- [Zurich](/journal-clubs/#Zurich) (Information available soon!)

**Taiwan**
- [Taipei](/journal-clubs/#Taipei) (Niall Duncan)

**United Kingdom**
- [Aberdeen](/journal-clubs/#Aberdeen) (Jessica Butler, Annesha Sil)
- Bristol, [University of Bristol](/journal-clubs/#Bristol, University of Bristol) (Katie Drax)
- Bristol, [UWE](/journal-clubs/#Bristol, UWE) (Charlotte Pennington)
- [Cambridge](/journal-clubs/#Cambridge%20ExPsy) (Ben Farrar: read more about his experience [here]({% post_url 2018-11-31-ReproducibiliTea-testimonial %}))
- [Canterbury](/_journal-clubs/#Canterbury) (Bethan Iley, Felicity Gallagher, Roger Giner-Sorolla)
- [Chester](/journal-clubs/#Chester) (Suzanne Stewart)
- [Glasgow](/journal-clubs/#Glasgow) (Stephanie Allan)
- Hull (coming soon!)
- [Kingston](/journal-clubs/#Kingston) (Emma Henderson)
- [Lancaster](/journal-clubs/#Lancaster) (Marina Bazhydai)
- [Leeds](/journal-clubs/#Leeds) (Emily Williams, Eike Mark Rinke, Kelly Lloyd, Stephen Bradley, Nour Halab)
- [Leicester](/journal-clubs/#Leicester) (Samantha Tyler, Tami Kalsi)
- [Liverpool](/journal-clubs/#Liverpool) (Andrew Jones)
- London, [UCL](/journal-clubs/#University College London) (Emma Norris, Jessie Balwin and Tabea Schoeler)
- Loughborough (coming soon!)
- [Manchester](/journal-clubs/#Manchester) (Thomas Richardson, Daniel Poole, Jade Pickering and George Farmer)
- [Oxford](/journal-clubs/#Oxford) (Sam Parsons, Matt Jaquiery, Nils Reimer, Paul Thompson, Sarah Ashcroft-Jones)
- [Plymouth](/_journal-clubs/#Plymouth) (Lenard Dome)
- [Portsmouth](/journal-clubs/#Portsmouth) (James Clay)
- Reading (coming soon!)
- [Sheffield](/journal-clubs/#Sheffield) (James Shaw)
- [Southampton](/journal-clubs/#Southampton) (Sophie Hall, Christian Bokhove)
- [Surrey](/journal-clubs/#Surrey) (Marta Topor, Henry Hebron, Katie Gilligan)
- Sussex (Coming soon!)
- [Swansea](/journal-clubs/#Swansea) (Laura Wilkinson)
- [York](/journal-clubs/#York) (Emma James, Anna á Váli Guttesen)
- York, York St John (coming soon!)

**United States**
- [Charlottesville](/journal-clubs/#Charlottesville), University of Virginia (Brian Nosek, Nick Buttrick)
- [Charlottesville (School of Education and Human Development)](/journal-clubs/#Charlottesville%20(School%20of%20Education%20and%20Human%20Development)), University of Virginia (Bryan G. Cook, Jesse Fleming)
- Florida (coming soon!)
- [Minnesota](/journal-clubs/#Minnesota) (Amy Riegelman, Alan Love)
- Princeton (coming soon!)
- [Richmond](/journal-clubs/#Richmond,%20Virginia%20(RVA)) (Dana Lapato, Timothy P. York, Nina Exner)
