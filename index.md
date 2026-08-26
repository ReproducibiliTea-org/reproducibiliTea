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

The ReproducibiliTea Journal Club has proven to be a success in Oxford, where it was founded in spring 2018 by Sophia Crüwell, Amy Orben, and Sam Parsons (then Masters student, PhD student, and early postdoc respectively). Since then, it has received widespread international recognition. There are now {{ site.journal-clubs.size | minus: 1}} other ReproducibiliTea Journal Clubs.

Want to join the movement? [Find your local journal club](/journal-clubs/), or find out [how to start one](/organizers/). Just curious for now? Grab your cup of (Reproducibili)tea and use our freely accessible and adaptable materials to explore.
<a rel="me" href="https://scicomm.xyz/@ReproducibiliTeaGlobal"></a>

{% include jc-map.html %}

<br/>

## What's on?

- **Online** — check the [community calendar](/calendar/) for upcoming sessions open to wider participation.
- **Near me** — browse [Find a Club](/journal-clubs/) to search for a journal club in your area.

<br/>

## Current Journal Clubs

{% include jc-showcase.html initial-value="" %}

{% assign countries = countries | split: "|" | uniq | sort_natural %}
{% for c in countries %}
{% assign jcs = site.journal-clubs | where: "country", c %}
{% assign jcs = jcs | sort_natural: "title" %}
{% assign jc_count = jcs | size %}
{% if jc_count > 0 %}
{:.jc-list #{{c}}}
### {{ c }} 
{% for jc in jcs %}
- [{{ jc.title }}](/journal-clubs/#{{ jc.title }}) ({{ jc.organisers | join: ", " }})
{:.jc-list}
{% endfor %}
{% endif %}
{% endfor %}

<br/>

## Our sponsors

{% include sponsors.html %}

<br/>

## ReproducibiliTeam

The ReproducibiliTea parent organisation is run by a Steering Committee of ECR volunteers: 


* Ze Freeman [@zefreeman.bsky.social](https://bsky.app/profile/zefreeman.bsky.social)
* Ezgi Hatip Ünlü [(LinkedIn)](https://www.linkedin.com/in/ezgi-hatip-unlu-752584149)
* Quentin Le Cornu [@quentinlc.bsky.social](https://bsky.app/profile/quentinlc.bsky.social) / [(LinkedIn)](https://www.linkedin.com/in/quentin-le-cornu-898546244/)
* Abigail Licata [@licataae.bsky.social](https://bsky.app/profile/licataae.bsky.social) / [(LinkedIn)](https://www.linkedin.com/in/abigail-licata-456929103/)
* Anastasiia Marmyleva [@marmyleva_ana](https://x.com/marmyleva_ana) / [@marmyleva-ana.bsky.social](https://bsky.app/profile/marmyleva-ana.bsky.social) / [(LinkedIn)](https://www.linkedin.com/in/anastasiia-marmyleva-5ba646106/)
* Marjan Monshi
* Michael Muhoozi [(LinkedIn)](https://www.linkedin.com/in/michael-muhoozi-9319724a/)
* Hemani Sharma [(LinkedIn)](https://www.linkedin.com/in/hemani-sharma-b9476516/)
* Lianne Wolsink [(LinkedIn)](https://www.linkedin.com/in/liannewolsink/) (Chair)



The Steering Committee alumni act as an Advisory Board who can be consulted when necessary.
The Advisory Board are:

* Sophia Crüwell [@cruwelli.bsky.social](https://bsky.app/profile/cruwelli.bsky.social) (Co-founder)
* Helena Gellersen [@hgellersen](https://twitter.com/hgellersen) 
* Matt Jaquiery
* Paulina Manduch [(LinkedIn)](https://www.linkedin.com/in/paulinamanduch/) 
* William Ngiam [@williamngiam.github.io](https://bsky.app/profile/williamngiam.github.io)
* Amy Orben [@orbenamy.bsky.social](https://bsky.app/profile/orbenamy.bsky.social) (Co-founder)
* Sam Parsons [@Sam_D_Parsons](https://twitter.com/Sam_D_Parsons) (Co-founder)
* Jade Pickering [@jadepickering.bsky.social](https://bsky.app/profile/jadepickering.bsky.social)
* Hazel Aileen van der Walle [@hazelvanderwalle.bsky.social](https://bsky.app/profile/hazelvanderwalle.bsky.social)
* Jan Vornhagen [@VornhagenJB@hci.social](https://hci.social/@VornhagenJB) 

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
* Kohrs, F. E., Auer, S., Bannach-Brown, A., Fiedler, S., Haven, T. L., Heise, V., Holman, C., Azevedo, F., Bernard, R., Bleier, A., Bössel, N., Cahill, B. P., Castro, L. J., Ehrenhofer, A., Eichel, K., Frank, M., Frick, C., Friese, M., Gärtner, A., Gierend, K., … Weissgerber, T. L. (2023). **Eleven strategies for making reproducible research and open science training the norm at research institutions**. eLife, 12, e89736. [https://doi.org/10.7554/eLife.89736](https://doi.org/10.7554/eLife.89736) 
* Haven, T., Gopalakrishna, G., Tijdink, J. et al. (2022). **Promoting trust in research and researchers: How open science and research integrity are intertwined**. BMC research notes, 15, 302. [https://doi.org/10.1186/s13104-022-06169-y](https://doi.org/10.1186/s13104-022-06169-y) 
* Kent, B. A., Holman, C., Amoako, E., Antonietti, A., Azam, J. M., Ballhausen, H., Bediako, Y., Belasen, A. M., Carneiro, C. F. D., Chen, Y. C., Compeer, E. B., Connor, C. A. C., Crüwell, S., Debat, H., Dorris, E., Ebrahimi, H., Erlich, J. C., Fernández-Chiappe, F., Fischer, F., Gazda, M. A., … Weissgerber, T. L. (2022). **Recommendations for empowering early career researchers to improve research culture and practice**. PLoS biology, 20(7), e3001680. [https://doi.org/10.1371/journal.pbio.3001680](https://doi.org/10.1371/journal.pbio.3001680)
* Armeni, K., Brinkman, L., Carlsson, R., Eerland, A., Fijten, R., Fondberg, R., Heininga, V. E., Heunis, S., Koh, W. Q., Masselik, M., Moran, N., Ó Baoill, A., Sarafoglou, A., Schettino, A., Schwamm, H., Sjoerds, Z., Teperek, M., van den Akker, O. R., van't Veer, A., Zurita-Milla, R. (2021). **Towards wide-scale adoption of open science practices: The role of open science communities**. Science and Public Policy, Volume 48, Issue 5, Pages 605–611, [https://doi.org/10.1093/scipol/scab039](https://doi.org/10.1093/scipol/scab039)
* Kathawalla, U.-K., Silverstein, P., & Syed, M. (2021). **Easing into open science: A guide for graduate students and their advisors**. Collabra: Psychology, 7(1), Article 18684. [https://doi.org/10.1525/collabra.18684](https://doi.org/10.1525/collabra.18684)
* Robson, S. G.,  Baum, M. A., Beaudry, J. L., Beitner, J., Brohmer, H., Chin, J. M., Jasko, K., Kouros, Ch. D., Laukkonen, R. E., Moreau, D., Searston, R. A., Slagter, H. A., Steffens, N. K., Tangen, J. M., Thomas, A. (2021). **Promoting Open Science: A Holistic Approach to Changing Behaviour**. Collabra: Psychology; 7 (1): 30137. [https://doi.org/10.1525/collabra.30137](https://doi.org/10.1525/collabra.30137)
* Orben A. (2019). **A journal club to fix science**. Nature, 573(7775), 465. [https://doi.org/10.1038/d41586-019-02842-8](https://doi.org/10.1038/d41586-019-02842-8)
