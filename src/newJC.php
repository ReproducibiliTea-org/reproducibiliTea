<?php
/**
 * Created by PhpStorm.
 * User: MJ
 * Date: 23/10/2019
 * Time: 11:33
 */

require('secret.php');

function done() {
    global $info;
    global $warnings;
    global $errors;

    die(json_encode(array(
        'info' => $info,
        'warnings' => $warnings,
        'errors' => $errors
    )));
}

$info = array();
$warnings = array();
$errors = array();


// Check auth code
if(!isset($_POST["auth-code"]) ||
    $_POST["auth-code"] !== secrets["authCode"]) {
    http_response_code(403);
    array_push($errors, 'The submitted authorisation code does not match our records.');
    done();
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
        array_push($errors, "The request is missing mandatory field '$keyName'.");
        done();
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
    array_push($errors, "The submitted email, $email, failed format validation.");
    done();
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
    array_push($errors, "The id field contains invalid characters.");
    done();
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
    array_push($errors, 'Unable to contact GitHub API.');
    done();
}

$JCs = json_decode($result);

foreach($JCs as $JC) {
    if($JC->name === $id.'.md') {
        http_response_code(400);
        array_push($errors, 'A journal club with that identifier already exists.');
        done();
    }
}

// Check for OSF repository with the appropriate name
$url = "https://api.test.osf.io/v2/nodes/?filter[title]=$name";

$handle = curl_init($url);
curl_setopt($handle, CURLOPT_HTTPHEADER, array(
    'Authorization: Bearer ' . secrets['osfToken']
));
curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);

$result = curl_exec($handle);
$node = json_decode($result);

curl_close($handle);

if(sizeof($node->data) > 0 &&
    array_key_exists('id', $node->data[0])) {
    // Found a match, issue a warning and continue.
    array_push($warnings, "An OSF repository with a similar name already exists. A new one will not be created.");
    $OSFid = $node->data[0]->id;
} else {
    // Create new OSF repository
    $url = "https://api.test.osf.io/v2/nodes/";

    $content =array(
        'data' => array(
            'type' => 'nodes',
            'attributes' => array(
                'title' => 'ReproducibiliTea ' . $name,
                'category' => 'other',
                'description' => "Materials from ReproducibiliTea sessions in $name. Templates and presentations are available for others to use and edit."
            ),
            'relationships' => array(
                'root' => array(
                    'data' => array(
                        'type' => 'nodes',
                        'id' => '384cb'
                    ),
                    'links' => array(
                        'related' => array(
                            'href' => 'https://test.osf.io/384cb/'
                        )
                    )
                )
            )
        )
    );

    $headers = [
        'Content-Type: application/vnd.api+json',
        'Accept: application/vnd.api+json',
        'Authorization: Bearer ' . secrets['osfToken'],
        'Content-Length: ' . strlen(json_encode($content))
    ];

    $handle = curl_init($url);
    curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($handle, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($content));

    $try = curl_exec($handle);

    $result = json_decode($try);

    curl_close($handle);

    $OSFid = $result->data->id;
}

if(!$OSFid) {
    http_response_code(412);
    array_push($errors, 'Unable to create OSF repository.');
    done();
}

// Create JC.md file and issue pull request on GitHub
$organisers = strlen($helperCSV)? $lead . ', ' . $helperCSV : $lead;
$file = base64_encode(<<<FILE
---
title: $name
host-organisation: $uni
host-org-url: $uniWWW
osf: $OSFid
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
//$result = file_get_contents($url, false, $context);


// Invite lead organiser to Slack Workspace

// Email lead organiser with welcome email

http_response_code(200);
array_push($info, "Success!");
done();