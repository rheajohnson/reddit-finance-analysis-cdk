import praw
import os
import regex as re
import time
import boto3
import json
import data
from nltk.sentiment.vader import SentimentIntensityAnalyzer
import nltk
nltk.data.path.append('/tmp')
nltk.download('vader_lexicon', download_dir='/tmp')

'''############################################################################'''
# set the program parameters
subs = ['wallstreetbets', 'stocks', 'investing',
        'stockmarket']     # sub-reddit to search
p_upvote_ratio = 0.70         # upvote ratio for post to be considered, 0.70 = 70%
p_upvotes_min = 30       # define # of upvotes, post is considered if upvotes exceed this #
c_limit = 5      # define the limit, comments 'replace more' limit
c_upvotes_min = 4     # define # of upvotes, comment is considered if upvotes exceed this #
top_count = 5     # define # of top tickers here
sentiment_count = 5    # define # of top ticker counts to analyze
'''############################################################################'''

p_analyzed, c_analyzed, comments, all_tickers = 0, 0, {}, {}


def get_tickers(sub, stockList):
    reddit = praw.Reddit(
        client_id=os.getenv('REDDIT_ID'),
        client_secret=os.getenv('REDDIT_SECRET'),
        user_agent=os.getenv('REDDIT_USER_AGENT'),
    )
    global p_analyzed, c_analyzed
    regex_pattern = r'\b([A-Z]+)\b'
    ticker_dict = stockList
    for submission in reddit.subreddit(sub).hot():
        # checking: post upvote ratio # of upvotes, post flair, and author
        if submission.upvote_ratio >= p_upvote_ratio and submission.ups > p_upvotes_min:
            submission.comment_sort = 'new'
            strings = [submission.title]
            p_analyzed += 1
            submission.comments.replace_more(limit=c_limit)
            for comment in submission.comments.list():
                c_analyzed += 1
                strings.append(comment.body)
                if comment.score > c_upvotes_min:
                    for s in strings:
                        for phrase in re.findall(regex_pattern, s):
                            if phrase not in data.blacklist and phrase in ticker_dict:
                                if phrase not in all_tickers:
                                    all_tickers[phrase] = 1
                                    comments[phrase] = [comment.body]
                                else:
                                    all_tickers[phrase] += 1
                                    comments[phrase].append(comment.body)


def s3_upload(obj, file_name):
    s3_client = boto3.client('s3')
    s3_client.put_object(Bucket=os.getenv('AWS_BUCKET_NAME'), Body=bytes(
        json.dumps(obj).encode('UTF-8')), Key=file_name)


def get_secret(aws_secret_name):
    region_name = os.getenv('AWS_REGION')

    secrets_client = boto3.client('secretsmanager', region_name)
    return secrets_client.get_secret_value(
        SecretId=aws_secret_name
    )


def lambda_handler(event, lambda_context):
    start_time = time.time()

    # get secret values from aws and set to environment
    secret_response = get_secret(os.environ['AWS_SECRET_NAME'])
    secret_dict = json.loads(secret_response['SecretString'])
    for key in secret_dict.keys():
        if key not in os.environ:
            os.environ[key] = secret_dict[key]

    # crawl comments of posts in subs and build all_comments for sentiment analysis, and all_tickers for most mentioned
    for sub in subs:
        get_tickers(sub, data.tickers)

    # sort the dictionary
    tickers_ordered = dict(
        sorted(all_tickers.items(), key=lambda item: item[1], reverse=True))
    top_tickers = list(tickers_ordered.keys())[0:top_count]

    # get top symbols with counts
    top_symbols_counts = {}
    for i in top_tickers:
        top_symbols_counts[i] = tickers_ordered[i]

    # print top picks
    print(f'Top tickers identified:\n{top_symbols_counts}\n')

    s3_upload(top_symbols_counts, 'top_counts.json')

    # Applying Sentiment Analysis
    scores = {}

    vader = SentimentIntensityAnalyzer()
    # adding custom words from data.py
    vader.lexicon.update(data.sentiment_words)

    sentiment_picks = list(tickers_ordered.keys())[0:sentiment_count]

    for symbol in sentiment_picks:
        stock_comments = comments[symbol]
        for comment in stock_comments:
            score = vader.polarity_scores(comment)
            if symbol in scores:
                for key in score.keys():
                    scores[symbol][key] += score[key]
            else:
                scores[symbol] = score
        # calculating avg.
        for key in score:
            scores[symbol][key] = scores[symbol][key] / len(stock_comments)

    s3_upload(scores, 'sentiment.json')

    run_time = round(time.time() - start_time)

    # print sentiment
    print(f'Sentiment analysis:\n{scores}\n')

    print(f'It took {run_time} seconds to analyze {c_analyzed} comments in {p_analyzed} posts in {len(subs)} subreddits.')
