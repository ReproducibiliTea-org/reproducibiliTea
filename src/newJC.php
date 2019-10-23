<?php
/**
 * Created by PhpStorm.
 * User: MJ
 * Date: 23/10/2019
 * Time: 11:33
 */

require('secret.php');

// Check auth code
if(!isset($_POST["auth-code"]) ||
    $_POST["auth-code"] !== secrets["authCode"]) {
    http_response_code(403);
    die('The submitted authorisation code does not match our records.');
}

// Check form data has mandatory fields
$requiredKeys = [
    'jcid',
    'name',
    'uni',
    'uni-www',
    'email',
    'post',
    'lead'
];

foreach($requiredKeys as $keyName) {
    if(!array_key_exists($keyName, $_POST)) {
        http_response_code(400);
        die("The request is missing mandatory field '$keyName'.");
    }
}

// Bind and clean values
$id = strtolower($_POST["jcid"]);
$name = $_POST["name"];
$uni = $_POST["uni"];
$uniWWW = $_POST["uni-www"];
$email = $_POST["email"];
if(!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    die("The submitted email, $email, failed format validation.");
}
$post = $_POST["post"];
$lead = $_POST["lead"];

$www = $_POST["www"];
$twitter = $_POST["twitter"];
$signup = $_POST["signup"];
$description = $_POST["description"];

$helpers = array();
$i = 0;
while(isset($_POST["helper$i"])) {
    array_push($helpers, $_POST["helper$i"]);
    $i++;
}

$helperCSV = $i? join(', ', $helpers) : "";

// Check JC doesn't already exist
if(preg_match('/$[a-z0-9]+^/', $id) !== 0) {
    http_response_code(400);
    die("The id field contains invalid characters.");
}

$url = 'https://api.github.com/repos/mjaquiery/reproducibiliTea/contents/_journal-clubs';

$opts = array('http' =>
    array(
        'header'  => 'User-Agent: mjaquiery', // GitHub requires a valid useragent
        'method'  => 'GET'
    )
);

$context = stream_context_create($opts);
$result = file_get_contents($url, false, $context);

if(!$result) {
    http_response_code(503);
    die('Unable to contact GitHub API.');
}

$JCs = json_decode($result);

foreach($JCs as $JC) {
    if($JC->name === $id.'.md') {
        http_response_code(400);
        die('A journal club with that identifier already exists.');
    }
}

// Create new OSF repository
$url = "https://api.test.osf.io/v2/nodes";

$opts = array('http' =>
    array(
        'method'  => 'POST',
        'content' => array(
            'data' => array(
                'type' => 'nodes',
                'attributes' => array(
                    'title' => 'ReproducibiliTea ' . $name,
                    'category' => 'uncategorized',
                    'description' => "Materials from ReproducibiliTea sessions in $name. Templates and presentations are available for others to use and edit."
                )
            )
        )
    )
);

$context = stream_context_create($opts);
$result = file_get_contents($url, false, $context);

$OSF = "";

// Create JC.md file and issue pull request on GitHub
$organisers = strlen($helperCSV)? $lead . ', ' . $helperCSV : $lead;
$file = base64_encode(<<<FILE
---
title: $name
host-organisation: $uni
host-org-url: $uniWWW
osf: $OSF
website: $www
twitter: $twitter
signup: $signup
organisers: [$organisers]
contact: $email
---

$description

FILE
);

$url = 'https://api.github.com/repos/mjaquiery/reproducibiliTea/contents/_journal-clubs/' . $name . '.md';

$opts = array('http' =>
    array(
        'header'  => 'User-Agent: mjaquiery', // GitHub requires a valid useragent
        'method'  => 'PUT',
        'content' => array(
            'message' => 'API creation of ' . $name . '.md',
            'content' => $file
        )
    )
);

$context = stream_context_create($opts);
$result = file_get_contents($url, false, $context);


// Invite lead organiser to Slack Workspace

// Email lead organiser with welcome email