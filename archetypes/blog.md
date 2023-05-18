---
date: {{ .Date }}
title: "{{ replace .Name "-" " " | title }}"
slug: {{ .Name }}
categories: ["blog", "cat1"]
tags: ["tag1", "tag2"]
summary: ""
---